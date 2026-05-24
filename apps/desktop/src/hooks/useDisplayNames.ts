import { useState, useEffect, useMemo } from "react";
import { ProfileManager } from "@nodes/transport-gun";
import { useNodeStore } from "../stores/node-store";
import { useIdentityStore } from "../stores/identity-store";
import { setCachedAvatarCid, getCachedDisplayName, setCachedDisplayName, getCachedAvatarCid } from "./useDisplayName";

const profileManager = new ProfileManager();

/**
 * Batch version — resolves multiple public keys at once.
 * Useful for the member list and typing indicators.
 *
 * Returns: Record<string, string> mapping publicKey → displayName
 */
export function useDisplayNames(publicKeys: string[]): {
  displayNames: Record<string, string>;
  avatarCids: Record<string, string>;
  isLoading: boolean;
} {
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [avatarCids, setAvatarCids] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const identityPublicKey = useIdentityStore((s) => s.publicKey);
  const identityDisplayName = useIdentityStore((s) => s.profile?.data.displayName);

  // Create a stable key for the publicKeys array
  const publicKeysKey = Array.from(new Set(publicKeys)).sort().join(",");

  // Initialize with cached values synchronously (instant render)
  const initialCached = useMemo(() => {
    const names: Record<string, string> = {};
    const avatars: Record<string, string> = {};
    for (const publicKey of publicKeys) {
      if (publicKey === "system") {
        names[publicKey] = "System";
      } else {
        const cachedName = getCachedDisplayName(publicKey);
        if (cachedName) names[publicKey] = cachedName;
        const cachedAvatar = getCachedAvatarCid(publicKey);
        if (cachedAvatar) avatars[publicKey] = cachedAvatar;
      }
    }
    return { names, avatars };
  }, [publicKeysKey]);

  useEffect(() => {
    if (publicKeys.length === 0) {
      setDisplayNames({});
      setAvatarCids({});
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const resolveNames = async () => {
      // Start with cached values (don't show empty while loading)
      const result: Record<string, string> = { ...initialCached.names };
      const avatars: Record<string, string> = { ...initialCached.avatars };
      const members = useNodeStore.getState().members;
      const missingKeys: string[] = [];

      // Set cached values immediately so UI isn't blank
      if (Object.keys(result).length > 0) {
        setDisplayNames(result);
        setAvatarCids(avatars);
      }
      setIsLoading(true);

      for (const publicKey of publicKeys) {
        // Already in result from cache
        if (result[publicKey]) continue;

        // Check current user
        if (publicKey === identityPublicKey && identityDisplayName) {
          setCachedDisplayName(publicKey, identityDisplayName);
          result[publicKey] = identityDisplayName;
          continue;
        }

        // Check member list
        if (activeNodeId && members[activeNodeId]) {
          const member = members[activeNodeId].find(
            (m) => m.publicKey === publicKey
          );
          if (member?.displayName) {
            setCachedDisplayName(publicKey, member.displayName);
            result[publicKey] = member.displayName;
            continue;
          }
        }

        // Needs a profile fetch
        missingKeys.push(publicKey);
      }

      // Fetch all missing keys in parallel
      if (missingKeys.length > 0) {
        await Promise.all(
          missingKeys.map(async (publicKey) => {
            try {
              const profile = await profileManager.getPublicProfile(publicKey);
              const name =
                profile?.displayName ||
                `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`;
              setCachedDisplayName(publicKey, name);
              result[publicKey] = name;
              // Cache avatar CID for use by Avatar components
              if (profile?.avatar) {
                setCachedAvatarCid(publicKey, profile.avatar);
                avatars[publicKey] = profile.avatar;
              }
            } catch {
              const fallback = `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`;
              setCachedDisplayName(publicKey, fallback);
              result[publicKey] = fallback;
            }
          })
        );
      }

      if (!cancelled) {
        setDisplayNames(result);
        setAvatarCids(avatars);
        setIsLoading(false);
      }
    };

    resolveNames();

    return () => {
      cancelled = true;
    };
  }, [publicKeysKey, activeNodeId, identityPublicKey, identityDisplayName, initialCached]);

  return { displayNames, avatarCids, isLoading };
}
