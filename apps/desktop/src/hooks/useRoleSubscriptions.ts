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
import { useIdentityStore } from "../stores/identity-store";

export function useRoleSubscriptions() {
  const isAuthenticated = useIdentityStore((s) => s.isAuthenticated);
  const publicKey = useIdentityStore((s) => s.publicKey);
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const setLoading = useRoleStore((s) => s.setLoading);
  const upsertRole = useRoleStore((s) => s.upsertRole);
  const setRoles = useRoleStore((s) => s.setRoles);
  
  // Store cleanup function
  const unsubscribeRef = useRef<(() => void) | null>(null);
  // Track if initial load is complete to avoid overwriting optimistic updates
  const initialLoadComplete = useRef(false);

  useEffect(() => {
    // Cleanup previous subscription
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
    initialLoadComplete.current = false;

    if (!isAuthenticated || !publicKey || !activeNodeId) return;

    // Set loading state
    setLoading(activeNodeId, true);

    // Subscribe to role changes - use upsertRole for each role instead of replacing all
    unsubscribeRef.current = roleManager.subscribeToRoles(activeNodeId, (roles) => {
      if (!initialLoadComplete.current) {
        // On initial load, set all roles at once
        setRoles(activeNodeId, roles);
        initialLoadComplete.current = true;
      } else {
        // After initial load, upsert each role to preserve optimistic updates
        for (const role of roles) {
          upsertRole(activeNodeId, role);
        }
      }
      setLoading(activeNodeId, false);
    });

    // Also load roles immediately (subscription takes time to trigger)
    roleManager.getRoles(activeNodeId).then((roles) => {
      if (!initialLoadComplete.current) {
        setRoles(activeNodeId, roles);
        initialLoadComplete.current = true;
      }
      setLoading(activeNodeId, false);
    });

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [isAuthenticated, publicKey, activeNodeId, setRoles, setLoading, upsertRole]);
}
