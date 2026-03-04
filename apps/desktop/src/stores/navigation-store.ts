import { create } from "zustand";

type ViewMode = "node" | "dm" | "friends" | "discovery";
type FriendsTab = "friends" | "incoming" | "outgoing" | "blocked";

interface NavigationState {
  viewMode: ViewMode;
  friendsTab: FriendsTab;
  setViewMode: (mode: ViewMode) => void;
  setFriendsTab: (tab: FriendsTab) => void;
  reset: () => void;
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
  friendsTab: "friends",
  setViewMode: (mode) => set({ viewMode: mode }),
  setFriendsTab: (tab) => set({ friendsTab: tab }),
  reset: () => set({ viewMode: "node", friendsTab: "friends" }),
}));
