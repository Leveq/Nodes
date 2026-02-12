import { useEffect, useRef } from "react";
import { useTransport, useConnectionState } from "../providers/TransportProvider";
import { useIdentityStore } from "../stores/identity-store";

/**
 * Hook that sets the user's presence status to online when connected.
 * Also handles cleanup (setting offline) when disconnecting or page unload.
 */
export function usePresenceStatus() {
  const transport = useTransport();
  const { isConnected } = useConnectionState();
  const isAuthenticated = useIdentityStore((s) => s.isAuthenticated);
  const hasSetOnline = useRef(false);

  useEffect(() => {
    if (!transport || !isAuthenticated) return;

    if (isConnected && !hasSetOnline.current) {
      // Set online when connected
      transport.presence.setStatus("online").then(() => {
        hasSetOnline.current = true;
      }).catch((err) => {
        console.warn("Failed to set presence status:", err);
      });
    } else if (!isConnected && hasSetOnline.current) {
      // Reset flag when disconnected
      hasSetOnline.current = false;
    }

    // Handle page unload (refresh, close tab)
    const handleBeforeUnload = () => {
      if (hasSetOnline.current && transport) {
        // Fire and forget - can't await in beforeunload
        transport.presence.setStatus("offline").catch(() => {});
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    // Cleanup: set offline when unmounting
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      if (hasSetOnline.current && transport) {
        transport.presence.setStatus("offline").catch(() => {
          // Ignore cleanup errors
        });
        hasSetOnline.current = false;
      }
    };
  }, [transport, isConnected, isAuthenticated]);
}
