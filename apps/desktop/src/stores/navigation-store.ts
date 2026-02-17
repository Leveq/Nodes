import { create } from "zustand";

type ViewMode = "node" | "dm" | "friends" | "discovery";

interface NavigationState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

/**
 * Navigation store manages the app's view mode.
 * - "node" mode: viewing Node channels
 * - "dm" mode: viewing direct messages
 * - "friends" mode: viewing friends and requests
 * - "discovery" mode: browsing public Nodes directory
 */
export const useNavigationStore = create<NavigationState>((set) => ({
  viewMode: "node",
  setViewMode: (mode) => set({ viewMode: mode }),
}));
