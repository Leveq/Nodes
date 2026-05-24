import { useEffect, useRef } from "react";
import { create } from "zustand";

interface AppVisibilityState {
  /** Whether the app window/tab is currently visible */
  isVisible: boolean;
  /** Whether the app just resumed from a long sleep (>30s gap) */
  didWake: boolean;
  setVisible: (visible: boolean) => void;
  setDidWake: (woke: boolean) => void;
}

export const useAppVisibilityStore = create<AppVisibilityState>((set) => ({
  isVisible: true,
  didWake: false,
  setVisible: (visible) => set({ isVisible: visible }),
  setDidWake: (woke) => set({ didWake: woke }),
}));

/**
 * Detects visibility changes and system sleep/wake.
 *
 * - Uses `document.visibilitychange` for tab/window hide/show.
 * - Detects sleep/wake by comparing expected vs actual interval gap.
 *   If the gap exceeds 30 seconds, the system likely slept and woke.
 *
 * Mount this once at the app root (AppShell).
 */
export function useAppVisibility() {
  const lastTickRef = useRef(Date.now());

  useEffect(() => {
    const { setVisible, setDidWake } = useAppVisibilityStore.getState();

    // Visibility change (tab switch, window minimise, Tauri hide-to-tray)
    const handleVisibilityChange = () => {
      const visible = !document.hidden;
      setVisible(visible);

      if (visible) {
        // Check if we were away for a long time (sleep/wake)
        const gap = Date.now() - lastTickRef.current;
        if (gap > 30_000) {
          setDidWake(true);
          // Reset after a short delay so consumers can react once
          setTimeout(() => setDidWake(false), 1_000);
        }
      }

      lastTickRef.current = Date.now();
    };

    // Heartbeat to detect gaps caused by system sleep
    // If the gap between ticks exceeds 30s, we slept and woke.
    const heartbeat = setInterval(() => {
      const now = Date.now();
      const gap = now - lastTickRef.current;
      lastTickRef.current = now;

      if (gap > 30_000 && !document.hidden) {
        const { setDidWake, setVisible } = useAppVisibilityStore.getState();
        setVisible(true);
        setDidWake(true);
        setTimeout(() => useAppVisibilityStore.getState().setDidWake(false), 1_000);
      }
    }, 5_000);

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearInterval(heartbeat);
    };
  }, []);
}
