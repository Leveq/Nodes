import { GunInstanceManager } from "./gun-instance";
import { IPFSService } from "./ipfs-service";

/**
 * AvatarManager handles avatar upload, storage, and retrieval.
 *
 * Avatars are stored on IPFS with CIDs saved in the user's Gun graph.
 * A local LRU cache prevents re-fetching the same avatar repeatedly.
 * 
 * Fetch order (optimized for speed):
 * 1. Memory cache (instant)
 * 2. Staging gateway (5s timeout) - fast, reliable, always has pinned content
 * 3. Helia P2P (10s timeout) - skipped on desktop/Tauri
 * 4. Public gateways (8s each) - last resort
 * 
 * Dual-pin pattern on upload:
 * - Pin locally to Helia for P2P availability
 * - Pin to staging server for HTTP gateway availability (needed for desktop)
 */

// Configuration - set via configure() from app level
let ipfsApiUrl: string | undefined;
let ipfsGatewayUrl: string | undefined;
// Custom fetch function for server pinning (Tauri uses native HTTP)
let serverPinFetch: typeof fetch | undefined;

// Detect if running in Tauri (desktop) - skip P2P, use gateway only
const isTauri = typeof window !== 'undefined' && '__TAURI__' in window;

/**
 * Configure IPFS endpoints for avatar pinning and fetching.
 * Call this from app initialization with Vite env vars.
 * 
 * @param config.serverPinFetch - Custom fetch for server pinning (use Tauri's native HTTP to bypass CORS)
 */
export function configureAvatarManager(config: {
  ipfsApiUrl?: string;
  ipfsGatewayUrl?: string;
  serverPinFetch?: typeof fetch;
}) {
  ipfsApiUrl = config.ipfsApiUrl;
  ipfsGatewayUrl = config.ipfsGatewayUrl;
  serverPinFetch = config.serverPinFetch;
  console.log("[Avatar] Configured - API:", ipfsApiUrl, "Gateway:", ipfsGatewayUrl, "CustomFetch:", !!serverPinFetch, "Tauri:", isTauri);
}

// Gun acknowledgement type
interface GunAck {
  err?: string;
  ok?: number;
}

const AVATAR_CACHE_MAX = 200;
const AVATAR_RESOLVE_TIMEOUT = 5000;
const FAILURE_CACHE_TTL = 60000; // 60 seconds before retrying failed fetches
const GATEWAY_TIMEOUT = 5000; // 5s for staging gateway (fast)
const P2P_TIMEOUT = 10000; // 10s for Helia P2P
const PUBLIC_GATEWAY_TIMEOUT = 8000; // 8s for public gateways

interface CachedAvatar {
  objectUrl: string;
  cid: string;
}

export class AvatarManager {
  // LRU cache: cacheKey → { objectUrl, cid }
  private cache = new Map<string, CachedAvatar>();

  // In-flight requests to deduplicate concurrent fetches
  private inFlight = new Map<string, Promise<string | null>>();

  // Negative cache: cacheKey → timestamp of failure (prevents retry loops)
  private failedCache = new Map<string, number>();

  /**
   * Pin image data to the staging IPFS node.
   * This makes it available via HTTP gateway for all clients.
   * Uses custom fetch (Tauri native HTTP) if configured to bypass CORS.
   */
  private async pinToServer(imageData: Uint8Array): Promise<string | null> {
    if (!ipfsApiUrl) {
      console.log("[Avatar] No IPFS_API_URL configured, skipping server pin");
      return null;
    }

    const fetchFn = serverPinFetch || fetch;

    // Build multipart body manually - Tauri's fetch doesn't serialize FormData correctly for Kubo
    const boundary = "----NodesBoundary" + Date.now();
    const header = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="avatar.png"\r\nContent-Type: image/png\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const headerBytes = new TextEncoder().encode(header);
    const footerBytes = new TextEncoder().encode(footer);

    const body = new Uint8Array(headerBytes.length + imageData.length + footerBytes.length);
    body.set(headerBytes, 0);
    body.set(imageData, headerBytes.length);
    body.set(footerBytes, headerBytes.length + imageData.length);

    const res = await fetchFn(`${ipfsApiUrl}/api/v0/add?pin=true`, {
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body: body,
    });

    if (!res.ok) {
      throw new Error(`IPFS pin failed: ${res.statusText}`);
    }
    const data = await res.json();
    return data.Hash;
  }

  /**
   * Upload a new avatar for the current user.
   * Pins to both local Helia (P2P) and staging server (gateway).
   * Stores the server's Qm CID in Gun (gateway-compatible).
   *
   * @param fullBytes - 256x256 avatar as Uint8Array
   * @param smallBytes - 64x64 avatar as Uint8Array
   * @returns Object with full and small CIDs, plus object URLs for immediate display
   */
  async uploadAvatar(
    fullBytes: Uint8Array,
    smallBytes: Uint8Array
  ): Promise<{ full: string; small: string; fullUrl: string; smallUrl: string }> {
    // Ensure IPFS is initialized
    if (!IPFSService.isReady()) {
      await IPFSService.init();
    }

    // 1. Pin to local Helia (P2P) - for local/peer availability
    const heliaFullCid = await IPFSService.upload(fullBytes);
    const heliaSmallCid = await IPFSService.upload(smallBytes);
    console.log("[Avatar] Helia upload complete. CID:", heliaFullCid);

    // 2. Pin to staging server - use server's Qm CID for storage (gateway-compatible)
    let fullCid = heliaFullCid;
    let smallCid = heliaSmallCid;

    try {
      const serverFullCid = await this.pinToServer(fullBytes);
      const serverSmallCid = await this.pinToServer(smallBytes);
      console.log(`[Avatar] Server pin: full=${serverFullCid}, small=${serverSmallCid}`);

      // Use server CIDs (Qm format) - guaranteed to be on gateway
      if (serverFullCid) fullCid = serverFullCid;
      if (serverSmallCid) smallCid = serverSmallCid;
    } catch (err) {
      console.warn("[Avatar] Server pin failed, using Helia CID (may not be gateway-accessible):", err);
    }

    // Store CIDs in user's Gun graph (prefer server Qm CID)
    const user = GunInstanceManager.user();

    await new Promise<void>((resolve, reject) => {
      user.get("profile").get("avatar").put(fullCid, (ack: GunAck) => {
        if (ack.err) reject(new Error(ack.err));
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      user.get("profile").get("avatarSmall").put(smallCid, (ack: GunAck) => {
        if (ack.err) reject(new Error(ack.err));
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      user.get("profile").get("_updatedAt").put(Date.now(), (ack: GunAck) => {
        if (ack.err) reject(new Error(ack.err));
        else resolve();
      });
    });

    // Invalidate cache and add new avatars
    const currentUserPub = user.is?.pub;
    if (currentUserPub) {
      this.invalidate(currentUserPub);
    }

    // Create object URLs for immediate display
    const fullBlob = new Blob([fullBytes.buffer as ArrayBuffer], { type: "image/png" });
    const smallBlob = new Blob([smallBytes.buffer as ArrayBuffer], { type: "image/png" });
    const fullUrl = URL.createObjectURL(fullBlob);
    const smallUrl = URL.createObjectURL(smallBlob);

    // Pre-populate cache so subsequent fetches work immediately
    if (currentUserPub) {
      console.log(`[Avatar] Pre-populating cache for ${currentUserPub}`);
      this.addToCache(`${currentUserPub}:full`, fullUrl, fullCid);
      this.addToCache(`${currentUserPub}:small`, smallUrl, smallCid);
      console.log(`[Avatar] Cache size after upload: ${this.cache.size}`);
    } else {
      console.warn("[Avatar] No currentUserPub, cannot populate cache");
    }

    return { full: fullCid, small: smallCid, fullUrl, smallUrl };
  }

  /**
   * Get a user's avatar as an object URL for rendering.
   * Checks cache first, then fetches from gateway/IPFS.
   *
   * @param publicKey - The user's public key
   * @param size - "full" (256px) or "small" (64px)
   * @param knownCid - Optional CID - if provided, skips Gun lookup
   * @returns Object URL for <img src="...">, or null if no avatar
   */
  async getAvatar(
    publicKey: string,
    size: "full" | "small" = "small",
    knownCid?: string
  ): Promise<string | null> {
    const cacheKey = `${publicKey}:${size}`;

    // 1. Check memory cache (instant)
    const cached = this.cache.get(cacheKey);
    if (cached) {
      // If we have a known CID and it doesn't match cached, invalidate
      if (knownCid && cached.cid !== knownCid) {
        console.log(`[Avatar] CID changed for ${cacheKey}: ${cached.cid} -> ${knownCid}, invalidating`);
        URL.revokeObjectURL(cached.objectUrl);
        this.cache.delete(cacheKey);
        this.failedCache.delete(cacheKey); // Clear failure cache too
      } else {
        // LRU bump: move to end
        this.cache.delete(cacheKey);
        this.cache.set(cacheKey, cached);
        return cached.objectUrl;
      }
    }

    // 2. Check negative cache (prevent retry loops)
    const failedAt = this.failedCache.get(cacheKey);
    if (failedAt && Date.now() - failedAt < FAILURE_CACHE_TTL) {
      console.log(`[Avatar] Skipping ${cacheKey} - failed ${Math.round((Date.now() - failedAt) / 1000)}s ago`);
      return null;
    }

    // 3. Deduplicate in-flight requests
    const existing = this.inFlight.get(cacheKey);
    if (existing) {
      console.log(`[Avatar] Reusing in-flight request for ${cacheKey}`);
      return existing;
    }

    // 4. Start fetch
    console.log(`[Avatar] Cache miss for ${cacheKey}, fetching...`);
    const promise = this.fetchAvatar(publicKey, size, cacheKey, knownCid);
    this.inFlight.set(cacheKey, promise);

    try {
      const result = await promise;
      if (!result) {
        // Cache the failure
        this.failedCache.set(cacheKey, Date.now());
      }
      return result;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  /**
   * Fetch an avatar. Order optimized for speed:
   * 1. Resolve CID from Gun (or use knownCid)
   * 2. Staging gateway (5s) - fast, reliable, has pinned content
   * 3. Helia P2P (10s) - skipped on desktop/Tauri
   * 4. Public gateways (8s each) - last resort
   */
  private async fetchAvatar(
    publicKey: string,
    size: "full" | "small",
    cacheKey: string,
    knownCid?: string
  ): Promise<string | null> {
    // Resolve CID
    let cid: string | null | undefined = knownCid;
    if (!cid) {
      const cidField = size === "full" ? "avatar" : "avatarSmall";
      cid = await this.resolveAvatarCid(publicKey, cidField);
    }

    if (!cid) {
      console.log(`[Avatar] No CID found for ${publicKey}`);
      return null;
    }

    console.log(`[Avatar] Fetching CID ${cid.slice(0, 12)}... for ${publicKey.slice(0, 8)}...`);

    // 1. Try staging gateway FIRST (fast, reliable)
    if (ipfsGatewayUrl) {
      try {
        const url = `${ipfsGatewayUrl}/ipfs/${cid}`;
        console.log(`[Avatar] Trying staging gateway: ${url}`);

        // Use custom fetch (Tauri) if available, otherwise browser fetch
        const fetchFn = serverPinFetch || fetch;
        const response = await fetchFn(url, {
          signal: AbortSignal.timeout(GATEWAY_TIMEOUT),
        });

        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          console.log(`[Avatar] Staging gateway succeeded for ${cid.slice(0, 12)}...`);
          this.addToCache(cacheKey, objectUrl, cid);
          return objectUrl;
        }
      } catch (err) {
        console.log(`[Avatar] Staging gateway failed:`, err instanceof Error ? err.message : err);
      }
    }

    // 2. Try Helia P2P (skip on Tauri - WebView2 P2P is broken)
    if (!isTauri) {
      try {
        if (!IPFSService.isReady()) {
          await IPFSService.init();
        }

        console.log(`[Avatar] Trying Helia P2P for ${cid.slice(0, 12)}...`);
        const data = await IPFSService.download(cid, P2P_TIMEOUT);
        const blob = new Blob([data.buffer as ArrayBuffer], { type: "image/png" });
        const objectUrl = URL.createObjectURL(blob);
        console.log(`[Avatar] Helia P2P succeeded for ${cid.slice(0, 12)}...`);
        this.addToCache(cacheKey, objectUrl, cid);
        return objectUrl;
      } catch (err) {
        console.log(`[Avatar] Helia P2P failed:`, err instanceof Error ? err.message : err);
      }
    } else {
      console.log(`[Avatar] Skipping Helia P2P (Tauri desktop)`);
    }

    // 3. Try public gateways (last resort)
    const publicGateways = [
      `https://ipfs.io/ipfs/${cid}`,
      `https://dweb.link/ipfs/${cid}`,
      `https://w3s.link/ipfs/${cid}`,
    ];

    for (const url of publicGateways) {
      try {
        console.log(`[Avatar] Trying public gateway: ${url}`);
        const fetchFn = serverPinFetch || fetch;
        const response = await fetchFn(url, {
          signal: AbortSignal.timeout(PUBLIC_GATEWAY_TIMEOUT),
        });

        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          console.log(`[Avatar] Public gateway succeeded: ${url}`);
          this.addToCache(cacheKey, objectUrl, cid);
          return objectUrl;
        }
      } catch {
        // Try next gateway
      }
    }

    console.warn(`[Avatar] All fetch paths failed for ${cid}`);
    return null;
  }

  /**
   * Resolve avatar CID from a user's Gun graph.
   */
  private resolveAvatarCid(
    publicKey: string,
    field: string
  ): Promise<string | null> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      let resolved = false;

      gun
        .user(publicKey)
        .get("profile")
        .get(field)
        .once((cid: unknown) => {
          if (resolved) return;
          resolved = true;

          if (
            cid &&
            typeof cid === "string" &&
            (cid.startsWith("bafy") || cid.startsWith("Qm"))
          ) {
            resolve(cid);
          } else {
            resolve(null);
          }
        });

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(null);
        }
      }, AVATAR_RESOLVE_TIMEOUT);
    });
  }

  /**
   * Add to LRU cache with eviction.
   */
  private addToCache(key: string, objectUrl: string, cid: string): void {
    // Evict oldest if at capacity
    if (this.cache.size >= AVATAR_CACHE_MAX) {
      const oldest = this.cache.keys().next().value;
      if (oldest) {
        const entry = this.cache.get(oldest);
        if (entry) URL.revokeObjectURL(entry.objectUrl);
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, { objectUrl, cid });
  }

  /**
   * Invalidate cache for a user (call after avatar update).
   */
  invalidate(publicKey: string): void {
    for (const size of ["full", "small"]) {
      const key = `${publicKey}:${size}`;
      const entry = this.cache.get(key);
      if (entry) {
        URL.revokeObjectURL(entry.objectUrl);
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear entire cache (call on logout).
   */
  clearCache(): void {
    for (const entry of this.cache.values()) {
      URL.revokeObjectURL(entry.objectUrl);
    }
    this.cache.clear();
    this.inFlight.clear();
    this.failedCache.clear();
  }

  /**
   * Get the number of cached avatars.
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

// Export a singleton instance
export const avatarManager = new AvatarManager();
