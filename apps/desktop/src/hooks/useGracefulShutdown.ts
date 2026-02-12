/**
 * Hook for handling graceful application shutdown.
 * Sets presence to offline and cleans up resources before exit.
 */
import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useTransport } from "../providers/TransportProvider";

/**
 * Listen for app:before-quit event from Tauri and perform cleanup.
 * This includes:
 * - Setting user's presence to offline
 * - Any other necessary cleanup
 */
export function useGracefulShutdown() {
  const transport = useTransport();

  useEffect(() => {
    const unlisten = listen("app:before-quit", async () => {
      console.log("[Shutdown] Received quit signal, cleaning up...");
      
      try {
        // Set presence to offline
        if (transport) {
          await transport.presence.setStatus("offline");
          console.log("[Shutdown] Set presence to offline");
        }
      } catch (error) {
        console.error("[Shutdown] Cleanup error:", error);
      }
    });

    // Cleanup listener on unmount
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [transport]);
}
