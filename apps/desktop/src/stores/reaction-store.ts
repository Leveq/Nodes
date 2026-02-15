import { create } from "zustand";
import type { ReactionData } from "@nodes/transport";

// Type for emoji → reactions array mapping
type MessageReactions = Record<string, ReactionData[]>;

interface ReactionStore {
  // Map: channelId → messageId → emoji → ReactionData[]
  reactions: Record<string, Record<string, MessageReactions>>;

  // Actions
  setReactionsForMessage: (
    channelId: string,
    messageId: string,
    reactions: MessageReactions
  ) => void;

  getReactionsForMessage: (
    channelId: string,
    messageId: string
  ) => MessageReactions;

  clearChannelReactions: (channelId: string) => void;
}

export const useReactionStore = create<ReactionStore>((set, get) => ({
  reactions: {},

  setReactionsForMessage: (channelId, messageId, reactions) => {
    const currentReactions = get().reactions[channelId]?.[messageId] || {};
    
    // Smart merge strategy:
    // - For emojis present in incoming data: use the incoming list (allows adds AND removes)
    // - For emojis NOT in incoming data: keep existing (prevents stale Gun reads from clearing)
    const mergedReactions: MessageReactions = {};
    
    // First, keep all existing emojis that aren't being updated
    const incomingEmojis = new Set(Object.keys(reactions));
    for (const [emoji, reactionList] of Object.entries(currentReactions)) {
      if (!incomingEmojis.has(emoji)) {
        // This emoji isn't in the update - preserve it
        mergedReactions[emoji] = reactionList;
      }
    }
    
    // Then, use the incoming data for emojis that are being updated
    for (const [emoji, reactionList] of Object.entries(reactions)) {
      if (reactionList.length > 0) {
        mergedReactions[emoji] = reactionList;
      }
      // If reactionList is empty, we don't add it (effectively removes the emoji)
    }
    
    set((state) => ({
      reactions: {
        ...state.reactions,
        [channelId]: {
          ...state.reactions[channelId],
          [messageId]: mergedReactions,
        },
      },
    }));
  },

  getReactionsForMessage: (channelId, messageId) => {
    const state = get();
    return state.reactions[channelId]?.[messageId] ?? {};
  },

  clearChannelReactions: (channelId) => {
    set((state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [channelId]: _removed, ...rest } = state.reactions;
      return { reactions: rest };
    });
  },
}));
