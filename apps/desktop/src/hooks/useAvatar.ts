import { useState, useEffect, useRef } from "react";
import { avatarManager } from "@nodes/transport-gun";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import { getCachedAvatarCid } from "./useDisplayName";

// Staging IPFS gateway (has pinned content from uploads)
const IPFS_GATEWAY_URL = import.meta.env.VITE_IPFS_GATEWAY_URL as string | undefined;

interface UseAvatarResult {
  avatarUrl: string | null;
  isLoading: boolean;
  error: boolean;
}

/**
 * Fetch avatar from IPFS HTTP gateway using Tauri's native HTTP client.
 * This bypasses WebView2's network issues.
 * Tries staging gateway first (has pinned content), then public gateways.
 */
async function fetchFromGatewayTauri(cid: string): Promise<string | null> {
  // Build gateway list - staging gateway first (has pinned content)
  const gateways: string[] = [];
  
  if (IPFS_GATEWAY_URL) {
    gateways.push(`${IPFS_GATEWAY_URL}/ipfs/${cid}`);
  }
  
  // Public gateways as fallback
  gateways.push(
    `https://ipfs.io/ipfs/${cid}`,
    `https://dweb.link/ipfs/${cid}`,
    `https://w3s.link/ipfs/${cid}`,
  );

  for (const url of gateways) {
    try {
      console.log(`[useAvatar] Trying Tauri gateway: ${url}`);
      const response = await tauriFetch(url, {
        method: "GET",
        connectTimeout: 10000,
      });
      
      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        const blob = new Blob([arrayBuffer], { type: "image/png" });
        const objectUrl = URL.createObjectURL(blob);
        console.log(`[useAvatar] Tauri gateway fetch succeeded: ${url}`);
        return objectUrl;
      }
    } catch (err) {
      console.warn(`[useAvatar] Tauri gateway failed: ${url}`, err);
    }
  }

  console.warn(`[useAvatar] All Tauri gateways failed for CID: ${cid}`);
  return null;
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
        let url = await avatarManager.getAvatar(publicKey, size, cidToUse);

        // If avatarManager failed but we have a CID, try Tauri's native HTTP client
        // This bypasses WebView2's network issues with external domains
        if (!url && cidToUse) {
          console.log(`[useAvatar] avatarManager failed, trying Tauri gateway for ${publicKey}`);
          url = await fetchFromGatewayTauri(cidToUse);
        }

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
