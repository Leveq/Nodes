import { useEffect, useRef } from "react";
import { useNodeStore } from "../stores/node-store";
import { useIdentityStore } from "../stores/identity-store";
import { directoryManager } from "@nodes/transport-gun";

const REFRESH_CHECK_INTERVAL = 60 * 60 * 1000; // Check every hour

/**
 * Automatically refreshes directory listings for Nodes owned by the current user.
 * Runs in the background. Only refreshes if the listing is in the directory.
 */
export function useDirectoryRefresh() {
  const isAuthenticated = useIdentityStore((s) => s.isAuthenticated);
  const publicKey = useIdentityStore((s) => s.publicKey);
  const nodes = useNodeStore((s) => s.nodes);
  const channels = useNodeStore((s) => s.channels);
  const members = useNodeStore((s) => s.members);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !publicKey) return;

    const refreshOwned = async () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        for (const node of nodes) {
          // Only refresh Nodes I own
          if (node.owner !== publicKey) continue;

          try {
            const isListed = await directoryManager.isListed(node.id);
            if (!isListed) continue;

            const nodeChannels = channels[node.id] || [];
            const nodeMembers = members[node.id] || [];

            // Refresh the listing with current data
            await directoryManager.refreshListing(node.id, {
              memberCount: nodeMembers.length,
              channelCount: nodeChannels.length,
              channelNames: nodeChannels.map((c) => c.name),
              name: node.name,
              description: node.description,
              icon: node.icon,
            });
          } catch {
            // Isolate per-node errors so other nodes still get refreshed
          }
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    // Initial refresh on mount (with longer delay to let Gun sync data)
    const initialTimeout = setTimeout(refreshOwned, 10000);

    // Periodic refresh
    intervalRef.current = setInterval(refreshOwned, REFRESH_CHECK_INTERVAL);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isAuthenticated, publicKey, nodes, channels, members]);
}
