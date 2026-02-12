import { useState, useEffect } from "react";
import { ProfileManager } from "@nodes/transport-gun";
import { useNodeStore } from "../stores/node-store";
import { useIdentityStore } from "../stores/identity-store";

// Module-level cache
const displayNameCache = new Map<string, string>();

const profileManager = new ProfileManager();

/**
 * Batch version — resolves multiple public keys at once.
 * Useful for the member list and typing indicators.
 *
 * Returns: Record<string, string> mapping publicKey → displayName
 */
export function useDisplayNames(publicKeys: string[]): {
  displayNames: Record<string, string>;
  isLoading: boolean;
} {
  const [displayNames, setDisplayNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const identityPublicKey = useIdentityStore((s) => s.publicKey);
  const identityDisplayName = useIdentityStore((s) => s.profile?.data.displayName);

  // Create a stable key for the publicKeys array
  const publicKeysKey = publicKeys.join(",");

  useEffect(() => {
    if (publicKeys.length === 0) {
      setDisplayNames({});
      setIsLoading(false);
      return;
    }

    const resolveNames = async () => {
      setIsLoading(true);
      const result: Record<string, string> = {};
      const members = useNodeStore.getState().members;

      for (const publicKey of publicKeys) {
        // System
        if (publicKey === "system") {
          result[publicKey] = "System";
          continue;
        }

        // Check cache
        if (displayNameCache.has(publicKey)) {
          result[publicKey] = displayNameCache.get(publicKey)!;
          continue;
        }

        // Check current user
        if (publicKey === identityPublicKey && identityDisplayName) {
          displayNameCache.set(publicKey, identityDisplayName);
          result[publicKey] = identityDisplayName;
          continue;
        }

        // Check member list
        if (activeNodeId && members[activeNodeId]) {
          const member = members[activeNodeId].find(
            (m) => m.publicKey === publicKey
          );
          if (member?.displayName) {
            displayNameCache.set(publicKey, member.displayName);
            result[publicKey] = member.displayName;
            continue;
          }
        }

        // Fetch from profile
        try {
          const profile = await profileManager.getPublicProfile(publicKey);
          const name =
            profile?.displayName ||
            `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`;
          displayNameCache.set(publicKey, name);
          result[publicKey] = name;
        } catch {
          const fallback = `${publicKey.slice(0, 6)}...${publicKey.slice(-4)}`;
          displayNameCache.set(publicKey, fallback);
          result[publicKey] = fallback;
        }
      }

      setDisplayNames(result);
      setIsLoading(false);
    };

    resolveNames();
  }, [publicKeysKey, activeNodeId, identityPublicKey, identityDisplayName]);

  return { displayNames, isLoading };
}
