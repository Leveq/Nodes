import { useEffect } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { useToastStore } from "../stores/toast-store";

/**
 * Checks for a new Nodes release on app launch.
 * If an update is found it downloads and installs it in the background,
 * then prompts the user to restart.
 */
export function useUpdater() {
  const addToast = useToastStore((s) => s.addToast);

  useEffect(() => {
    // Only runs inside the Tauri runtime
    if (!("__TAURI_INTERNALS__" in window)) return;

    let cancelled = false;

    async function checkForUpdate() {
      try {
        const update = await check();
        if (!update || cancelled) return;

        addToast(
          "info",
          `Update ${update.version} available — downloading…`,
          0 // persistent until replaced
        );

        await update.downloadAndInstall();

        if (!cancelled) {
          addToast(
            "success",
            "Update installed! Restart Nodes to apply.",
            0
          );
        }
      } catch (err) {
        // Silently ignore — updater errors shouldn't surface to the user
        console.warn("[updater]", err);
      }
    }

    checkForUpdate();
    return () => {
      cancelled = true;
    };
  }, [addToast]);
}
