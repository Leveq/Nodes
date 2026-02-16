import { useEffect, useRef } from "react";
import { GunInstanceManager } from "@nodes/transport-gun";
import { useIdentityStore } from "../stores/identity-store";
import { useNodeStore } from "../stores/node-store";
import { useToastStore } from "../stores/toast-store";
import type { KickNotification } from "@nodes/core";

/**
 * Listens for kick/ban signals directed at the current user.
 * When detected, removes the Node from the sidebar and shows a notification.
 */
export function useModerationEvents() {
  const publicKey = useIdentityStore((s) => s.publicKey);
  const nodes = useNodeStore((s) => s.nodes);
  const removeNodeFromState = useNodeStore((s) => s.removeNodeFromState);
  const addToast = useToastStore((s) => s.addToast);
  
  // Track which kicks we've already processed to avoid duplicate toasts
  const processedKicks = useRef<Set<string>>(new Set());
  // Track subscription start time to filter out old kick data
  const subscriptionStart = useRef<number>(Date.now());

  useEffect(() => {
    if (!publicKey) return;
    
    // Update subscription start time when effect runs
    subscriptionStart.current = Date.now();

    const cleanupFns: Array<() => void> = [];

    for (const node of nodes) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const gun = GunInstanceManager.get() as any;
        
        // Subscribe to the kicks collection using map().on() which is more reliable
        // for detecting new entries than subscribing to a specific key
        const kicksRef = gun
          .get("nodes")
          .get(node.id)
          .get("kicks");

        const handler = (data: KickNotification | null, key: string) => {
          // Only care about kicks for our public key
          if (key !== publicKey) return;
          if (!data || !data.kickedAt) return;

          // Create a unique key for this kick event
          const kickKey = `${node.id}_${data.kickedAt}`;
          
          // Skip if we've already processed this kick
          if (processedKicks.current.has(kickKey)) return;

          // Only process kicks that happened after we started listening
          // This prevents reacting to stale kick data on reconnect/mount
          if (data.kickedAt < subscriptionStart.current - 5000) {
            console.log(`[Moderation] Ignoring old kick for ${node.name} (kickedAt: ${data.kickedAt}, subscriptionStart: ${subscriptionStart.current})`);
            return;
          }

          // Mark as processed
          processedKicks.current.add(kickKey);

          console.log(`[Moderation] Kick detected for ${node.name}:`, data);

          const reasonText = data.reason ? `: ${data.reason}` : "";

          if (data.banned) {
            addToast("error", `You have been banned from ${node.name}${reasonText}`);
          } else {
            addToast("warning", `You were kicked from ${node.name}${reasonText}`);
          }

          // Remove from local state
          removeNodeFromState(node.id);

          // Clear the kick signal so it doesn't re-trigger on reconnect
          kicksRef.get(publicKey).put(null);
        };

        // Use map().on() to watch all kicks - more reliable for new entries
        kicksRef.map().on(handler);
        cleanupFns.push(() => kicksRef.map().off());
      } catch (error) {
        console.error(`[Moderation] Error subscribing to kicks for node ${node.id}:`, error);
      }
    }

    return () => {
      for (const fn of cleanupFns) {
        try {
          fn();
        } catch {
          // Ignore cleanup errors
        }
      }
    };
  }, [publicKey, nodes, removeNodeFromState, addToast]);

  // Clean up old processed kicks periodically (memory hygiene)
  useEffect(() => {
    const interval = setInterval(() => {
      // Clear the set if it gets too large
      if (processedKicks.current.size > 100) {
        processedKicks.current.clear();
      }
    }, 60000);

    return () => clearInterval(interval);
  }, []);
}
