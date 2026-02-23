import { useState, useEffect, useRef } from "react";
import { avatarManager } from "@nodes/transport-gun";
import { getCachedAvatarCid } from "./useDisplayName";

interface UseAvatarResult {
  avatarUrl: string | null;
  isLoading: boolean;
  error: boolean;
}

/**
 * Hook to fetch and cache a user's avatar from IPFS.
 *
 * Fetch order (handled by avatarManager):
 * 1. Staging gateway (5s) - fast, reliable, has pinned content
 * 2. Helia P2P (10s) - skipped on Tauri desktop
 * 3. Public gateways (8s each) - last resort
 *
 * Returns:
 *   - avatarUrl: Object URL for img src, or null if no avatar
 *   - isLoading: true while fetching from IPFS
 *   - error: true if fetch failed
 *
 * @param publicKey - User's public key
 * @param size - "full" (256px) or "small" (64px)
 * @param version - Optional version number to trigger re-fetch (e.g., after avatar upload)
 * @param avatarCid - Optional direct CID - if provided, skips Gun lookup
 */
export function useAvatar(
  publicKey: string | undefined,
  size: "full" | "small" = "small",
  version: number = 0,
  avatarCid?: string
): UseAvatarResult {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    if (!publicKey) {
      setAvatarUrl(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchAvatar = async () => {
      setIsLoading(true);
      setError(false);

      try {
        // Use provided CID, or check cache from profile fetch, or let avatarManager do Gun lookup
        const cidToUse = avatarCid || getCachedAvatarCid(publicKey);
        const url = await avatarManager.getAvatar(publicKey, size, cidToUse);

        if (!cancelled && mountedRef.current) {
          setAvatarUrl(url);
          setIsLoading(false);
        }
      } catch (err) {
        console.error("[useAvatar] Failed to fetch avatar:", err);
        if (!cancelled && mountedRef.current) {
          setError(true);
          setIsLoading(false);
        }
      }
    };

    fetchAvatar();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [publicKey, size, version, avatarCid]);

  return { avatarUrl, isLoading, error };
}
