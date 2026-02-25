import { useState, useEffect } from "react";
import { ProfileManager } from "@nodes/transport-gun";
import { useNodeStore } from "../stores/node-store";
import { useIdentityStore } from "../stores/identity-store";

// Module-level cache to avoid repeated lookups
const displayNameCache = new Map<string, string>();

// Module-level cache for avatar CIDs (populated when profile is fetched)
const avatarCidCache = new Map<string, string>();

const profileManager = new ProfileManager();

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

    // Check local cache first
    if (displayNameCache.has(publicKey)) {
      setDisplayName(displayNameCache.get(publicKey)!);
      setIsLoading(false);
      return;
    }

    // Check if it's the current user
    if (publicKey === identityPublicKey && identityDisplayName) {
      displayNameCache.set(publicKey, identityDisplayName);
      setDisplayName(identityDisplayName);
      setIsLoading(false);
      return;
    }

    // Check global displayNameCache from node store (resolved by MemberSidebar)
    const nodeStoreCache = useNodeStore.getState().displayNameCache;
    if (nodeStoreCache[publicKey]?.name) {
      displayNameCache.set(publicKey, nodeStoreCache[publicKey].name);
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
        const name =
          profile?.displayName || `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`;
        displayNameCache.set(publicKey, name);
        setDisplayName(name);
        
        // Also cache avatar CID if present
        if (profile?.avatar) {
          avatarCidCache.set(publicKey, profile.avatar);
        }
      })
      .catch(() => {
        if (cancelled) return;
        const fallback = `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`;
        displayNameCache.set(publicKey, fallback);
        setDisplayName(fallback);
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
}
