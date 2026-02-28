import { useEffect, useRef } from "react";
import { NodeManager } from "@nodes/transport-gun";
import { useNodeStore } from "../stores/node-store";
import { useIdentityStore } from "../stores/identity-store";

const nodeManager = new NodeManager();

// Refresh interval for polling channel changes
const CHANNEL_POLL_INTERVAL = 4_000; // 4 seconds

/**
 * Hook that polls for channel list changes for the active Node.
 * Detects channel additions and deletions and updates the node store.
 * Uses the same polling approach as useMemberSubscription for Gun compatibility.
 */
export function useChannelSubscription() {
  const isAuthenticated = useIdentityStore((s) => s.isAuthenticated);
  const publicKey = useIdentityStore((s) => s.publicKey);
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!isAuthenticated || !publicKey || !activeNodeId) return;

    const pollChannels = async () => {
      try {
        const freshChannels = await nodeManager.getChannels(activeNodeId);
        const state = useNodeStore.getState();
        const currentChannels = state.channels[activeNodeId] || [];

        const freshIds = new Set(freshChannels.map((c) => c.id));
        const currentIds = new Set(currentChannels.map((c) => c.id));

        const hasNewChannels = freshChannels.some((c) => !currentIds.has(c.id));
        const hasRemovedChannels = currentChannels.some((c) => !freshIds.has(c.id));
        const hasUpdatedChannels = freshChannels.some((fresh) => {
          const current = currentChannels.find((c) => c.id === fresh.id);
          if (!current) return false;
          return (
            current.name !== fresh.name ||
            current.topic !== fresh.topic ||
            current.position !== fresh.position ||
            current.slowMode !== fresh.slowMode
          );
        });

        if (!hasNewChannels && !hasRemovedChannels && !hasUpdatedChannels) return;

        useNodeStore.setState((s) => {
          const activeChannelId = s.activeChannelId;

          // If active channel was deleted, clear it
          const newActiveChannelId =
            activeChannelId && freshIds.has(activeChannelId)
              ? activeChannelId
              : freshChannels.length > 0
              ? freshChannels[0].id
              : null;

          return {
            channels: { ...s.channels, [activeNodeId]: freshChannels },
            activeChannelId: newActiveChannelId,
          };
        });
      } catch {
        // Silent fail
      }
    };

    // Start polling
    intervalRef.current = setInterval(pollChannels, CHANNEL_POLL_INTERVAL);

    // Immediate poll after a short delay
    const initialPoll = setTimeout(pollChannels, 1500);

    return () => {
      clearTimeout(initialPoll);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated, publicKey, activeNodeId]);
}
