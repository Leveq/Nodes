import { useState, useEffect } from "react";
import { ProfileManager } from "@nodes/transport-gun";
import { useNodeStore } from "../stores/node-store";
import { useIdentityStore } from "../stores/identity-store";
import { getCache, setCache, CacheKeys, deleteCache } from "../services/app-cache";

// Module-level cache to avoid repeated lookups
const displayNameCache = new Map<string, string>();

// Module-level cache for avatar CIDs (populated when profile is fetched)
const avatarCidCache = new Map<string, string>();

const profileManager = new ProfileManager();

// Flag to track if we've loaded from IndexedDB
let cacheLoaded = false;

// Load display name cache from IndexedDB on module init
async function loadDisplayNameCacheFromDb(): Promise<void> {
  if (cacheLoaded) return;
  try {
    const cached = await getCache<Record<string, string>>(CacheKeys.displayNames());
    if (cached) {
      Object.entries(cached).forEach(([key, value]) => {
        displayNameCache.set(key, value);
      });
    }
    cacheLoaded = true;
  } catch {
    // Non-fatal, continue without cache
  }
}

// Save display name cache to IndexedDB (debounced)
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function saveDisplayNameCacheToDb(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    try {
      const obj: Record<string, string> = {};
      displayNameCache.forEach((value, key) => {
        obj[key] = value;
      });
      await setCache(CacheKeys.displayNames(), obj);
    } catch {
      // Non-fatal
    }
  }, 1000); // Debounce 1 second
}

// Initialize cache on module load
loadDisplayNameCacheFromDb();

/**
 * Hook to resolve a public key to a display name.
 *
 * Resolution order:
 * 1. Check current Node's member list (from nodeStore.members)
 * 2. Check if it's the current user (from identityStore)
 * 3. Fall back to profile resolution via ProfileManager
 * 4. Ultimate fallback: truncated public key ("qt1BM...h0Mh8")
 */
export function useDisplayName(publicKey: string | undefined): {
  displayName: string;
  isLoading: boolean;
} {
  const [displayName, setDisplayName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const identityPublicKey = useIdentityStore((s) => s.publicKey);
  const identityDisplayName = useIdentityStore((s) => s.profile?.data.displayName);

  useEffect(() => {
    let cancelled = false;

    if (!publicKey) {
      setDisplayName("Unknown");
      setIsLoading(false);
      return;
    }

    // System messages
    if (publicKey === "system") {
      setDisplayName("System");
      setIsLoading(false);
      return;
    }

    // Current user: always prefer the live identity display name (and refresh
    // the cache) so a self name change is reflected immediately, before the
    // possibly-stale module cache is consulted.
    if (publicKey === identityPublicKey && identityDisplayName) {
      if (displayNameCache.get(publicKey) !== identityDisplayName) {
        displayNameCache.set(publicKey, identityDisplayName);
        saveDisplayNameCacheToDb();
      }
      setDisplayName(identityDisplayName);
      setIsLoading(false);
      return;
    }

    // Check local cache first
    if (displayNameCache.has(publicKey)) {
      setDisplayName(displayNameCache.get(publicKey)!);
      setIsLoading(false);
      return;
    }

    // Check global displayNameCache from node store (resolved by MemberSidebar)
    const nodeStoreCache = useNodeStore.getState().displayNameCache;
    if (nodeStoreCache[publicKey]?.name) {
      displayNameCache.set(publicKey, nodeStoreCache[publicKey].name);
      saveDisplayNameCacheToDb();
      setDisplayName(nodeStoreCache[publicKey].name);
      setIsLoading(false);
      return;
    }

    // Check member list for the current Node (get from store directly to avoid subscription)
    const members = useNodeStore.getState().members;
    if (activeNodeId && members[activeNodeId]) {
      const member = members[activeNodeId].find(
        (m) => m.publicKey === publicKey
      );
      if (member?.displayName) {
        displayNameCache.set(publicKey, member.displayName);
        saveDisplayNameCacheToDb();
        setDisplayName(member.displayName);
        setIsLoading(false);
        return;
      }
    }

    // Fall back to profile resolution
    setIsLoading(true);
    profileManager
      .getPublicProfile(publicKey)
      .then((profile) => {
        if (cancelled) return;
        if (profile?.displayName) {
          // Only persist a real resolved name.
          displayNameCache.set(publicKey, profile.displayName);
          saveDisplayNameCacheToDb();
          setDisplayName(profile.displayName);
          if (profile.avatar) {
            avatarCidCache.set(publicKey, profile.avatar);
          }
        } else {
          // Profile not replicated yet. Show the truncated key but do NOT cache
          // it, so a later mount retries once the profile syncs.
          setDisplayName(`${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`);
        }
      })
      .catch(() => {
        if (cancelled) return;
        // Transient failure — show hex without caching so it can recover.
        setDisplayName(`${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [publicKey, activeNodeId, identityPublicKey, identityDisplayName]);

  return { displayName, isLoading };
}

/**
 * Get a cached display name for a public key.
 */
export function getCachedDisplayName(publicKey: string): string | undefined {
  return displayNameCache.get(publicKey);
}

/**
 * Set a cached display name for a public key (also saves to IndexedDB).
 */
export function setCachedDisplayName(publicKey: string, name: string): void {
  displayNameCache.set(publicKey, name);
  saveDisplayNameCacheToDb();
}

/**
 * Get a cached avatar CID for a public key (populated by useDisplayName or setCachedAvatarCid).
 */
export function getCachedAvatarCid(publicKey: string): string | undefined {
  return avatarCidCache.get(publicKey);
}

/**
 * Set a cached avatar CID for a public key.
 */
export function setCachedAvatarCid(publicKey: string, cid: string): void {
  avatarCidCache.set(publicKey, cid);
}

/**
 * Clear the display name and avatar CID caches (e.g., on Node switch).
 */
export function clearDisplayNameCache(): void {
  displayNameCache.clear();
  avatarCidCache.clear();
  // Also clear IndexedDB cache
  deleteCache(CacheKeys.displayNames()).catch(() => {});
  cacheLoaded = false;
}
