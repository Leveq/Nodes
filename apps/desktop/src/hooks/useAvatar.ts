import { useState, useEffect, useRef } from "react";
import { avatarManager } from "@nodes/transport-gun";

interface UseAvatarResult {
  avatarUrl: string | null;
  isLoading: boolean;
  error: boolean;
}

/**
 * Hook to fetch and cache a user's avatar from IPFS.
 *
 * Returns:
 *   - avatarUrl: Object URL for img src, or null if no avatar
 *   - isLoading: true while fetching from IPFS
 *   - error: true if fetch failed
 *
 * Automatically cleans up object URLs on unmount or when publicKey changes.
 */
export function useAvatar(
  publicKey: string | undefined,
  size: "full" | "small" = "small"
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
        const url = await avatarManager.getAvatar(publicKey, size);

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
  }, [publicKey, size]);

  return { avatarUrl, isLoading, error };
}
