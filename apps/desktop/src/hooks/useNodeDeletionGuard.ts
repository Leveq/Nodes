import { useEffect, useRef } from "react";
import { NodeManager } from "@nodes/transport-gun";
import { useNodeStore } from "../stores/node-store";
import { useThemeStore } from "../stores/theme-store";
import { useIdentityStore } from "../stores/identity-store";

const nodeManager = new NodeManager();

/**
 * Watches every node in the store for deletion or theme changes by subscribing
 * to each node's Gun metadata.
 *
 * - Deletion: auto-removes the node from local state for all online members.
 * - Theme change: re-applies the node theme live if it's the active node,
 *   so other members see theme updates without needing to reload.
 */
export function useNodeDeletionGuard() {
  const isAuthenticated = useIdentityStore((s) => s.isAuthenticated);
  const nodes = useNodeStore((s) => s.nodes);
  // Map of nodeId → unsubscribe fn for currently watched nodes
  const unsubsRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    if (!isAuthenticated) {
      unsubsRef.current.forEach((unsub) => unsub());
      unsubsRef.current.clear();
      return;
    }

    const watchedIds = new Set(unsubsRef.current.keys());
    const currentIds = new Set(nodes.map((n) => n.id));

    // Subscribe to nodes that aren't yet being watched
    for (const node of nodes) {
      if (watchedIds.has(node.id)) continue;

      const unsub = nodeManager.subscribeToNodeMeta(
        node.id,
        // onDeleted
        () => {
          const stillPresent = useNodeStore.getState().nodes.some((n) => n.id === node.id);
          if (stillPresent) {
            useNodeStore.getState().removeNodeFromState(node.id);
          }
        },
        // onThemeChange — fires for OTHER clients when the owner saves a new theme
        (theme) => {
          const activeNodeId = useNodeStore.getState().activeNodeId;
          if (activeNodeId !== node.id) return; // not viewing this node
          const themeStore = useThemeStore.getState();
          if (theme) {
            themeStore.applyNodeTheme(theme);
          } else {
            themeStore.clearNodeTheme();
          }
        }
      );

      unsubsRef.current.set(node.id, unsub);
    }

    // Unsubscribe from nodes that were removed from state (user left/was kicked)
    for (const [nodeId, unsub] of unsubsRef.current) {
      if (!currentIds.has(nodeId)) {
        unsub();
        unsubsRef.current.delete(nodeId);
      }
    }
  }, [isAuthenticated, nodes]);

  // Clean up all subscriptions on unmount
  useEffect(() => {
    return () => {
      unsubsRef.current.forEach((unsub) => unsub());
      unsubsRef.current.clear();
    };
  }, []);
}
