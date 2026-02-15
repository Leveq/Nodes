/**
 * useRoleSubscriptions hook - Subscribes to role changes for the active Node
 *
 * When the active Node changes, this hook subscribes to role data from the
 * Gun graph and updates the role store.
 */

import { useEffect, useRef } from "react";
import { roleManager } from "@nodes/transport-gun";
import { useNodeStore } from "../stores/node-store";
import { useRoleStore } from "../stores/role-store";

export function useRoleSubscriptions() {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const setRoles = useRoleStore((s) => s.setRoles);
  const setLoading = useRoleStore((s) => s.setLoading);
  
  // Store cleanup function
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Cleanup previous subscription
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }

    if (!activeNodeId) return;

    // Set loading state
    setLoading(activeNodeId, true);

    // Subscribe to role changes
    unsubscribeRef.current = roleManager.subscribeToRoles(activeNodeId, (roles) => {
      setRoles(activeNodeId, roles);
      setLoading(activeNodeId, false);
    });

    // Also load roles immediately (subscription takes time to trigger)
    roleManager.getRoles(activeNodeId).then((roles) => {
      setRoles(activeNodeId, roles);
      setLoading(activeNodeId, false);
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [activeNodeId, setRoles, setLoading]);
}
