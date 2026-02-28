import { useEffect, useRef } from "react";
import { NodeManager } from "@nodes/transport-gun";
import { useNodeStore } from "../stores/node-store";
import { useIdentityStore } from "../stores/identity-store";

const nodeManager = new NodeManager();

// Refresh interval for polling member changes
const MEMBER_POLL_INTERVAL = 5_000; // 5 seconds

/**
 * Hook that polls for member changes for the active Node.
 * This is a simple polling approach that works reliably with Gun's eventual consistency.
 * - Adds new members when they join
 * - Removes members when they leave
 * - Preserves the `status` field set by presence system
 */
export function useMemberSubscription() {
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

    // Poll for member changes periodically
    const pollMembers = async () => {
      try {
        const freshMembers = await nodeManager.getMembers(activeNodeId);
        const currentMembers = useNodeStore.getState().members[activeNodeId] || [];
        
        const freshKeys = new Set(freshMembers.map(m => m.publicKey));
        const currentKeys = new Set(currentMembers.map(m => m.publicKey));
        
        // Find new members (in fresh but not in current)
        const newMembers = freshMembers.filter(m => !currentKeys.has(m.publicKey));
        
        // Find removed members (in current but not in fresh)
        const removedKeys = new Set(
          currentMembers
            .filter(m => !freshKeys.has(m.publicKey))
            .map(m => m.publicKey)
        );

        // Find members whose role assignments have changed
        const roleUpdatedMembers = freshMembers.filter(freshMember => {
          const current = currentMembers.find(m => m.publicKey === freshMember.publicKey);
          if (!current) return false; // new member, handled above
          return JSON.stringify(current.roles) !== JSON.stringify(freshMember.roles);
        });
        
        // Only update if there are changes
        if (newMembers.length > 0 || removedKeys.size > 0 || roleUpdatedMembers.length > 0) {
          useNodeStore.setState(state => {
            const existing = state.members[activeNodeId] || [];
            
            // Keep existing members that weren't removed (preserves status)
            // Apply role updates to existing members where roles changed
            const kept = existing
              .filter(m => !removedKeys.has(m.publicKey))
              .map(m => {
                const roleUpdate = roleUpdatedMembers.find(u => u.publicKey === m.publicKey);
                return roleUpdate ? { ...m, roles: roleUpdate.roles } : m;
              });
            
            // Add new members
            const updated = [...kept, ...newMembers];
            
            return {
              members: {
                ...state.members,
                [activeNodeId]: updated
              }
            };
          });
        }
      } catch {
        // Silent fail
      }
    };

    // Start polling
    intervalRef.current = setInterval(pollMembers, MEMBER_POLL_INTERVAL);

    // Also do an immediate poll after a short delay
    const initialPoll = setTimeout(pollMembers, 1000);

    return () => {
      clearTimeout(initialPoll);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isAuthenticated, publicKey, activeNodeId]);
}
