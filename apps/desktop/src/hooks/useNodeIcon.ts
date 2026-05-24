import { useState, useEffect, useRef } from "react";
import { nodeIconManager } from "@nodes/transport-gun";

interface UseNodeIconResult {
  iconUrl: string | null;
  isLoading: boolean;
}

/**
 * Hook to fetch and cache a Node's icon from IPFS.
 * Mirrors the useAvatar hook pattern.
 *
 * @param nodeId - The Node's ID
 * @param iconCid - The icon's IPFS CID (from node.icon). Pass empty/non-CID for emoji/letter icons.
 * @returns iconUrl (object URL for img src) and isLoading
 */
export function useNodeIcon(
  nodeId: string | undefined,
  iconCid: string | undefined
): UseNodeIconResult {
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const mountedRef = useRef(true);

  // Only fetch if iconCid is a valid IPFS CID
  const isIpfsCid = iconCid
    ? iconCid.startsWith("Qm") || iconCid.startsWith("bafy")
    : false;

  useEffect(() => {
    mountedRef.current = true;

    if (!nodeId || !iconCid || !isIpfsCid) {
      setIconUrl(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const fetchIcon = async () => {
      setIsLoading(true);
      try {
        const url = await nodeIconManager.getIcon(nodeId, iconCid);
        if (!cancelled && mountedRef.current) {
          setIconUrl(url);
        }
      } catch (err) {
        console.error("[useNodeIcon] Failed to fetch icon:", err);
      } finally {
        if (!cancelled && mountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    fetchIcon();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [nodeId, iconCid, isIpfsCid]);

  return { iconUrl, isLoading };
}
