import { create } from "zustand";

interface ReplyTarget {
  messageId: string;
  authorKey: string;
  contentPreview: string;
}

interface ReplyState {
  // Map: channelId → current reply target (or null)
  replyTargets: Record<string, ReplyTarget | null>;

  // Actions
  setReplyTarget: (channelId: string, target: ReplyTarget | null) => void;
  getReplyTarget: (channelId: string) => ReplyTarget | null;
  clearReplyTarget: (channelId: string) => void;
}

export const useReplyStore = create<ReplyState>((set, get) => ({
  replyTargets: {},

  setReplyTarget: (channelId, target) => {
    set((state) => ({
      replyTargets: {
        ...state.replyTargets,
        [channelId]: target,
      },
    }));
  },

  getReplyTarget: (channelId) => {
    return get().replyTargets[channelId] ?? null;
  },

  clearReplyTarget: (channelId) => {
    set((state) => ({
      replyTargets: {
        ...state.replyTargets,
        [channelId]: null,
      },
    }));
  },
}));
