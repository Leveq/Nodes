import { useEffect, useRef, useCallback, useMemo } from "react";
import type { Unsubscribe, PresenceInfo } from "@nodes/transport";
import type { UserStatus } from "@nodes/core";
import { useTransport } from "../providers/TransportProvider";
import { useNodeStore } from "../stores/node-store";
import { useSocialStore } from "../stores/social-store";

const OFFLINE_THRESHOLD = 60_000; // 60 seconds
const STALENESS_CHECK_INTERVAL = 15_000; // Check every 15 seconds

/**
 * Hook that subscribes to presence changes for:
 * - All members in the active Node
 * - All friends (always visible regardless of Node)
 * Updates member status in real-time as users come online/offline.
 * Also periodically checks for stale presence data.
 */
export function usePresenceSubscriptions() {
  const transport = useTransport();
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const members = useNodeStore((s) => s.members);
  const friends = useSocialStore((s) => s.friends);

  // Memoize the member keys for the active node to avoid unnecessary re-renders
  const activeMemberKeys = useMemo(() => {
    if (!activeNodeId) return [];
    const nodeMembers = members[activeNodeId] || [];
    return nodeMembers.map(m => m.publicKey);
  }, [activeNodeId, members]);

  // Store presence subscription for cleanup
  const subscriptionRef = useRef<Unsubscribe | null>(null);
  // Store last seen times for staleness checking
  const lastSeenRef = useRef<Map<string, number>>(new Map());
  // Interval for staleness checking
  const stalenessIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update member status in store
  const updateMemberStatus = useCallback((publicKey: string, status: UserStatus, nodeId: string | null) => {
    if (!nodeId) return;
    
    useNodeStore.setState((state) => {
      const currentMembers = state.members[nodeId] || [];
      const memberIndex = currentMembers.findIndex((m) => m.publicKey === publicKey);
      
      if (memberIndex === -1) return state;
      if (currentMembers[memberIndex].status === status) return state;

      const updatedMembers = [...currentMembers];
      updatedMembers[memberIndex] = { ...updatedMembers[memberIndex], status };

      return {
        ...state,
        members: {
          ...state.members,
          [nodeId]: updatedMembers,
        },
      };
    });
  }, []);

  useEffect(() => {
    // Cleanup previous subscription and interval
    if (subscriptionRef.current) {
      subscriptionRef.current();
      subscriptionRef.current = null;
    }
    if (stalenessIntervalRef.current) {
      clearInterval(stalenessIntervalRef.current);
      stalenessIntervalRef.current = null;
    }
    // Clear lastSeen when node changes
    lastSeenRef.current.clear();

    if (!transport) return;

    // Collect public keys: node members + friends
    const publicKeySet = new Set<string>();

    // Add members from active node (using memoized keys)
    for (const key of activeMemberKeys) {
      publicKeySet.add(key);
    }

    // Add all friends (they're always presence-visible)
    friends.forEach((f) => publicKeySet.add(f.publicKey));

    const publicKeys = Array.from(publicKeySet);
    if (publicKeys.length === 0) return;

    // Subscribe to presence changes
    const unsub = transport.presence.subscribe(publicKeys, (presence: PresenceInfo) => {
      // Track lastSeen for staleness checking
      lastSeenRef.current.set(presence.publicKey, presence.lastSeen || 0);

      // Update the member's status in the store (if in active Node)
      updateMemberStatus(presence.publicKey, presence.status, activeNodeId);
    });

    subscriptionRef.current = unsub;

    // Periodic staleness check - detect users who went offline without event
    stalenessIntervalRef.current = setInterval(() => {
      const now = Date.now();
      
      for (const [publicKey, lastSeen] of lastSeenRef.current) {
        if (lastSeen > 0 && now - lastSeen > OFFLINE_THRESHOLD) {
          // User is stale, mark as offline
          updateMemberStatus(publicKey, "offline", activeNodeId);
        }
      }
    }, STALENESS_CHECK_INTERVAL);

    // Cleanup on unmount or when dependencies change
    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current();
        subscriptionRef.current = null;
      }
      if (stalenessIntervalRef.current) {
        clearInterval(stalenessIntervalRef.current);
        stalenessIntervalRef.current = null;
      }
    };
  }, [transport, activeNodeId, activeMemberKeys, friends, updateMemberStatus]);
}
