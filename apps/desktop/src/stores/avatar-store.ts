import { create } from "zustand";

/**
 * Reactive map of publicKey → current avatar CID.
 *
 * Written by every place that resolves a profile avatar (member-list live
 * subscription, display-name resolution, DM views) via `setCachedAvatarCid`,
 * and read reactively by the `Avatar` component so a peer's avatar change
 * propagates to every surface (text, voice, sidebar) — not just the member bar.
 */
interface AvatarStore {
  cids: Record<string, string>;
  setCid: (publicKey: string, cid: string) => void;
}

export const useAvatarStore = create<AvatarStore>((set) => ({
  cids: {},
  setCid: (publicKey, cid) =>
    set((state) =>
      state.cids[publicKey] === cid
        ? state
        : { cids: { ...state.cids, [publicKey]: cid } }
    ),
}));
