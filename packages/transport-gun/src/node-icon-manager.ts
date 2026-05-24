import { IPFSService } from "./ipfs-service";

/**
 * NodeIconManager handles upload, caching, and retrieval of Node icons.
 *
 * Mirrors the AvatarManager pattern:
 * - LRU memory cache with object URLs
 * - In-flight request deduplication
 * - Negative cache to prevent retry loops
 * - Multi-gateway fetch fallback chain
 * - Dual-pin on upload (Helia + staging server)
 *
 * Node icon CIDs are stored in the shared Gun graph at:
 *   gun.get("nodes").get(nodeId).put({ icon: cidString })
 * (handled by node-manager.ts updateNode)
 */

// Configuration - shared from avatar-manager's configure call
let ipfsApiUrl: string | undefined;
let ipfsGatewayUrl: string | undefined;
let serverPinFetch: typeof fetch | undefined;

const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

export function configureNodeIconManager(config: {
  ipfsApiUrl?: string;
  ipfsGatewayUrl?: string;
  serverPinFetch?: typeof fetch;
}) {
  ipfsApiUrl = config.ipfsApiUrl;
  ipfsGatewayUrl = config.ipfsGatewayUrl;
  serverPinFetch = config.serverPinFetch;
}

const ICON_CACHE_MAX = 100;
const FAILURE_CACHE_TTL = 60000;
const GATEWAY_TIMEOUT = 5000;
const P2P_TIMEOUT = 10000;
const PUBLIC_GATEWAY_TIMEOUT = 8000;

interface CachedIcon {
  objectUrl: string;
  cid: string;
}

class NodeIconManager {
  private cache = new Map<string, CachedIcon>();
  private inFlight = new Map<string, Promise<string | null>>();
  private failedCache = new Map<string, number>();

  /**
   * Pin image data to the staging IPFS node.
   */
  private async pinToServer(imageData: Uint8Array): Promise<string | null> {
    if (!ipfsApiUrl) return null;

    const fetchFn = serverPinFetch || fetch;
    const boundary = "----NodesBoundary" + Date.now();
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="node-icon.png"\r\nContent-Type: image/png\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const headerBytes = new TextEncoder().encode(header);
    const footerBytes = new TextEncoder().encode(footer);

    const body = new Uint8Array(headerBytes.length + imageData.length + footerBytes.length);
    body.set(headerBytes, 0);
    body.set(imageData, headerBytes.length);
    body.set(footerBytes, headerBytes.length + imageData.length);

    const res = await fetchFn(`${ipfsApiUrl}/api/v0/add?pin=true`, {
      method: "POST",
      headers: { "Content-Type": `multipart/form-data; boundary=${boundary}` },
      body: body,
    });

    if (!res.ok) throw new Error(`IPFS pin failed: ${res.statusText}`);
    const data = await res.json();
    return data.Hash;
  }

  /**
   * Upload a Node icon to IPFS (dual-pin) and return the CID + object URL.
   * Caller is responsible for storing the CID via updateNode({ icon: cid }).
   */
  async uploadIcon(
    nodeId: string,
    iconBytes: Uint8Array
  ): Promise<{ cid: string; objectUrl: string }> {
    if (!IPFSService.isReady()) {
      await IPFSService.init();
    }

    // 1. Pin to Helia (P2P)
    const heliaCid = await IPFSService.upload(iconBytes);

    // 2. Pin to staging server
    let cid = heliaCid;
    try {
      const serverCid = await this.pinToServer(iconBytes);
      if (serverCid) cid = serverCid;
    } catch (err) {
      console.warn("[NodeIcon] Server pin failed, using Helia CID:", err);
    }

    // 3. Invalidate old cache entry for this node
    this.invalidate(nodeId);

    // 4. Create object URL and pre-populate cache
    const blob = new Blob([iconBytes.buffer as ArrayBuffer], { type: "image/png" });
    const objectUrl = URL.createObjectURL(blob);
    this.addToCache(nodeId, objectUrl, cid);

    return { cid, objectUrl };
  }

  /**
   * Get a Node's icon as an object URL.
   * Checks cache → gateway → P2P → public gateways.
   *
   * @param nodeId - The Node's ID
   * @param iconCid - The IPFS CID of the icon (from node.icon field)
   * @returns Object URL for <img src>, or null
   */
  async getIcon(nodeId: string, iconCid: string): Promise<string | null> {
    const cacheKey = nodeId;

    // 1. Memory cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      if (cached.cid !== iconCid) {
        // CID changed — invalidate and re-fetch
        URL.revokeObjectURL(cached.objectUrl);
        this.cache.delete(cacheKey);
        this.failedCache.delete(cacheKey);
      } else {
        // LRU bump
        this.cache.delete(cacheKey);
        this.cache.set(cacheKey, cached);
        return cached.objectUrl;
      }
    }

    // 2. Negative cache
    const failedAt = this.failedCache.get(cacheKey);
    if (failedAt && Date.now() - failedAt < FAILURE_CACHE_TTL) {
      return null;
    }

    // 3. Dedup in-flight
    const existing = this.inFlight.get(cacheKey);
    if (existing) return existing;

    // 4. Fetch
    const promise = this.fetchIcon(cacheKey, iconCid);
    this.inFlight.set(cacheKey, promise);

    try {
      const result = await promise;
      if (!result) this.failedCache.set(cacheKey, Date.now());
      return result;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private async fetchIcon(cacheKey: string, cid: string): Promise<string | null> {
    // 1. Staging gateway
    if (ipfsGatewayUrl) {
      try {
        const fetchFn = serverPinFetch || fetch;
        const response = await fetchFn(`${ipfsGatewayUrl}/ipfs/${cid}`, {
          signal: AbortSignal.timeout(GATEWAY_TIMEOUT),
        });
        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          this.addToCache(cacheKey, objectUrl, cid);
          return objectUrl;
        }
      } catch { /* next */ }
    }

    // 2. Helia P2P (skip on Tauri)
    if (!isTauri) {
      try {
        if (!IPFSService.isReady()) await IPFSService.init();
        const data = await IPFSService.download(cid, P2P_TIMEOUT);
        const blob = new Blob([data.buffer as ArrayBuffer], { type: "image/png" });
        const objectUrl = URL.createObjectURL(blob);
        this.addToCache(cacheKey, objectUrl, cid);
        return objectUrl;
      } catch { /* next */ }
    }

    // 3. Public gateways
    const publicGateways = [
      `https://ipfs.io/ipfs/${cid}`,
      `https://dweb.link/ipfs/${cid}`,
      `https://w3s.link/ipfs/${cid}`,
    ];

    for (const url of publicGateways) {
      try {
        const fetchFn = serverPinFetch || fetch;
        const response = await fetchFn(url, {
          signal: AbortSignal.timeout(PUBLIC_GATEWAY_TIMEOUT),
        });
        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          this.addToCache(cacheKey, objectUrl, cid);
          return objectUrl;
        }
      } catch { /* next */ }
    }

    console.warn(`[NodeIcon] All fetch paths failed for ${cid}`);
    return null;
  }

  private addToCache(key: string, objectUrl: string, cid: string): void {
    if (this.cache.size >= ICON_CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest) {
        const entry = this.cache.get(oldest);
        if (entry) URL.revokeObjectURL(entry.objectUrl);
        this.cache.delete(oldest);
      }
    }
    this.cache.set(key, { objectUrl, cid });
  }

  invalidate(nodeId: string): void {
    const entry = this.cache.get(nodeId);
    if (entry) {
      URL.revokeObjectURL(entry.objectUrl);
      this.cache.delete(nodeId);
    }
    this.failedCache.delete(nodeId);
  }

  clearCache(): void {
    for (const entry of this.cache.values()) {
      URL.revokeObjectURL(entry.objectUrl);
    }
    this.cache.clear();
    this.inFlight.clear();
    this.failedCache.clear();
  }
}

export const nodeIconManager = new NodeIconManager();
