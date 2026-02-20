import { GunInstanceManager } from "./gun-instance";
import { IPFSService } from "./ipfs-service";

/**
 * AvatarManager handles avatar upload, storage, and retrieval.
 *
 * Avatars are stored on IPFS with CIDs saved in the user's Gun graph.
 * A local LRU cache prevents re-fetching the same avatar repeatedly.
 * 
 * Dual-pin pattern:
 * - Pin locally to Helia for P2P availability
 * - Pin to staging server for HTTP gateway availability (needed for desktop)
 */

// Configuration - set via configure() from app level
let ipfsApiUrl: string | undefined;
let ipfsGatewayUrl: string | undefined;
// Custom fetch function for server pinning (Tauri uses native HTTP)
let serverPinFetch: typeof fetch | undefined;

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
  console.log("[Avatar] Configured - API:", ipfsApiUrl, "Gateway:", ipfsGatewayUrl, "CustomFetch:", !!serverPinFetch);
}

// Gun acknowledgement type
interface GunAck {
  err?: string;
  ok?: number;
}

const AVATAR_CACHE_MAX = 200;
const AVATAR_RESOLVE_TIMEOUT = 5000;

interface CachedAvatar {
  objectUrl: string;
  cid: string;
}

export class AvatarManager {
  // LRU cache: cacheKey → { objectUrl, cid }
  private cache = new Map<string, CachedAvatar>();

  // Pending requests to avoid duplicate fetches
  private pending = new Map<string, Promise<string | null>>();

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

    // Use custom fetch (Tauri) if provided, otherwise browser fetch
    const fetchFn = serverPinFetch || fetch;
    
    const formData = new FormData();
    formData.append("file", new Blob([imageData.buffer as ArrayBuffer], { type: "image/png" }));

    const res = await fetchFn(`${ipfsApiUrl}/api/v0/add`, {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`IPFS pin failed: ${res.statusText}`);
    }

    const data = await res.json();
    return data.Hash; // CID
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
   * Checks cache first, then fetches from IPFS.
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

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      // If we have a known CID and it doesn't match cached, invalidate cache
      if (knownCid && cached.cid !== knownCid) {
        console.log(`[Avatar] CID changed for ${cacheKey}: ${cached.cid} -> ${knownCid}, invalidating cache`);
        URL.revokeObjectURL(cached.objectUrl);
        this.cache.delete(cacheKey);
      } else {
        console.log(`[Avatar] Cache hit for ${cacheKey}`);
        // Move to end (most recently used)
        this.cache.delete(cacheKey);
        this.cache.set(cacheKey, cached);
        return cached.objectUrl;
      }
    }

    console.log(`[Avatar] Cache miss for ${cacheKey}, fetching...`);

    // Check if we're already fetching this avatar
    if (this.pending.has(cacheKey)) {
      return this.pending.get(cacheKey)!;
    }

    // Start fetching
    const fetchPromise = this.fetchAvatar(publicKey, size, cacheKey, knownCid);
    this.pending.set(cacheKey, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.pending.delete(cacheKey);
    }
  }

  /**
   * Fetch an avatar from Gun → IPFS.
   * Falls back to HTTP gateway if P2P fails (e.g., WebView2 WebRTC issues).
   * 
   * NOTE: Gateway fallback only works if avatars are pinned to a public service.
   * Currently avatars are only on user's local Helia nodes with no DHT announcement,
   * so gateways can't find them. TODO: Add pinning on upload for cross-platform support.
   */
  private async fetchAvatar(
    publicKey: string,
    size: "full" | "small",
    cacheKey: string,
    knownCid?: string
  ): Promise<string | null> {
    // Use known CID if provided, otherwise resolve from Gun
    let cid: string | null | undefined = knownCid;
    if (!cid) {
      const cidField = size === "full" ? "avatar" : "avatarSmall";
      cid = await this.resolveAvatarCid(publicKey, cidField);
    }

    if (!cid) return null;

    // Try P2P first (works on web/staging, may fail on desktop due to WebView2)
    try {
      // Ensure IPFS is initialized
      if (!IPFSService.isReady()) {
        await IPFSService.init();
      }

      // Fetch from IPFS - use shorter timeout (10s) since WebView2 P2P often fails
      const data = await IPFSService.download(cid, 10000);
      const blob = new Blob([data.buffer as ArrayBuffer], { type: "image/png" });
      const objectUrl = URL.createObjectURL(blob);

      // Add to cache
      this.addToCache(cacheKey, objectUrl, cid);

      return objectUrl;
    } catch (err) {
      console.warn(`[Avatar] P2P fetch failed for ${publicKey}, trying gateway:`, err);
    }

    // Gateway fallback - works when P2P fails (e.g., Tauri desktop)
    try {
      const objectUrl = await this.fetchFromGateway(cid);
      if (objectUrl) {
        this.addToCache(cacheKey, objectUrl, cid);
        return objectUrl;
      }
    } catch (err) {
      console.error(`[Avatar] Gateway fallback also failed for ${publicKey}:`, err);
    }

    return null;
  }

  /**
   * Fetch avatar from IPFS HTTP gateway.
   * Tries staging gateway first, then public gateways.
   */
  private async fetchFromGateway(cid: string): Promise<string | null> {
    // Build gateway list - staging gateway first (has pinned content)
    const gateways: string[] = [];
    
    if (ipfsGatewayUrl) {
      gateways.push(`${ipfsGatewayUrl}/ipfs/${cid}`);
    }
    
    // Public gateways as fallback
    gateways.push(
      `https://ipfs.io/ipfs/${cid}`,
      `https://dweb.link/ipfs/${cid}`,
      `https://w3s.link/ipfs/${cid}`,
    );

    for (const url of gateways) {
      try {
        console.log(`[Avatar] Trying gateway: ${url}`);
        const response = await fetch(url, { 
          signal: AbortSignal.timeout(8000) 
        });
        
        if (response.ok) {
          const blob = await response.blob();
          const objectUrl = URL.createObjectURL(blob);
          console.log(`[Avatar] Gateway fetch succeeded: ${url}`);
          return objectUrl;
        }
      } catch {
        // Try next gateway
      }
    }

    console.warn(`[Avatar] All gateways failed for CID: ${cid}`);
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
    this.pending.clear();
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
