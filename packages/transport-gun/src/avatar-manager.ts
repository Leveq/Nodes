import { GunInstanceManager } from "./gun-instance";
import { IPFSService } from "./ipfs-service";

/**
 * AvatarManager handles avatar upload, storage, and retrieval.
 *
 * Avatars are stored on IPFS with CIDs saved in the user's Gun graph.
 * A local LRU cache prevents re-fetching the same avatar repeatedly.
 */

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
   * Upload a new avatar for the current user.
   *
   * @param fullBytes - 256x256 avatar as Uint8Array
   * @param smallBytes - 64x64 avatar as Uint8Array
   * @returns Object with full and small CIDs
   */
  async uploadAvatar(
    fullBytes: Uint8Array,
    smallBytes: Uint8Array
  ): Promise<{ full: string; small: string }> {
    // Ensure IPFS is initialized
    if (!IPFSService.isReady()) {
      await IPFSService.init();
    }

    const fullCid = await IPFSService.upload(fullBytes);
    const smallCid = await IPFSService.upload(smallBytes);

    // Store CIDs in user's Gun graph
    const user = GunInstanceManager.user();
    
    await new Promise<void>((resolve, reject) => {
      user.get("profile").get("avatar").put(fullCid, (ack: any) => {
        if (ack.err) reject(new Error(ack.err));
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      user.get("profile").get("avatarSmall").put(smallCid, (ack: any) => {
        if (ack.err) reject(new Error(ack.err));
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      user.get("profile").get("_updatedAt").put(Date.now(), (ack: any) => {
        if (ack.err) reject(new Error(ack.err));
        else resolve();
      });
    });

    // Invalidate our own cache
    const currentUserPub = user.is?.pub;
    if (currentUserPub) {
      this.invalidate(currentUserPub);
    }

    return { full: fullCid, small: smallCid };
  }

  /**
   * Get a user's avatar as an object URL for rendering.
   * Checks cache first, then fetches from IPFS.
   *
   * @param publicKey - The user's public key
   * @param size - "full" (256px) or "small" (64px)
   * @returns Object URL for <img src="...">, or null if no avatar
   */
  async getAvatar(
    publicKey: string,
    size: "full" | "small" = "small"
  ): Promise<string | null> {
    const cacheKey = `${publicKey}:${size}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      // Move to end (most recently used)
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached.objectUrl;
    }

    // Check if we're already fetching this avatar
    if (this.pending.has(cacheKey)) {
      return this.pending.get(cacheKey)!;
    }

    // Start fetching
    const fetchPromise = this.fetchAvatar(publicKey, size, cacheKey);
    this.pending.set(cacheKey, fetchPromise);

    try {
      return await fetchPromise;
    } finally {
      this.pending.delete(cacheKey);
    }
  }

  /**
   * Fetch an avatar from Gun → IPFS.
   */
  private async fetchAvatar(
    publicKey: string,
    size: "full" | "small",
    cacheKey: string
  ): Promise<string | null> {
    // Resolve CID from user's Gun graph
    const cidField = size === "full" ? "avatar" : "avatarSmall";
    const cid = await this.resolveAvatarCid(publicKey, cidField);

    if (!cid) return null;

    try {
      // Ensure IPFS is initialized
      if (!IPFSService.isReady()) {
        await IPFSService.init();
      }

      // Fetch from IPFS
      const data = await IPFSService.download(cid);
      const blob = new Blob([data], { type: "image/png" });
      const objectUrl = URL.createObjectURL(blob);

      // Add to cache
      this.addToCache(cacheKey, objectUrl, cid);

      return objectUrl;
    } catch (err) {
      console.error(`[Avatar] Failed to fetch avatar for ${publicKey}:`, err);
      return null;
    }
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
