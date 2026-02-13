import { create } from "zustand";
import type { TransportMessage, Unsubscribe } from "@nodes/transport";

interface MessageState {
  // Messages keyed by channelId
  messages: Record<string, TransportMessage[]>;

  // Typing indicators keyed by channelId → publicKey[]
  typingUsers: Record<string, string[]>;

  // Unread tracking: channelId → count
  unreadCounts: Record<string, number>;

  // Loading state: which channels are currently loading history
  loadingChannels: Record<string, boolean>;

  // Currently active subscriptions
  activeSubscription: Unsubscribe | null;
  activeTypingSub: Unsubscribe | null;

  // Actions
  setLoading: (channelId: string, loading: boolean) => void;
  setMessages: (channelId: string, messages: TransportMessage[]) => void;
  addMessage: (channelId: string, message: TransportMessage) => void;
  setSubscription: (unsub: Unsubscribe | null) => void;
  setTypingSubscription: (unsub: Unsubscribe | null) => void;
  setTypingUsers: (channelId: string, users: string[]) => void;
  addTypingUser: (channelId: string, publicKey: string) => void;
  removeTypingUser: (channelId: string, publicKey: string) => void;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
  clearChannel: (channelId: string) => void;
  clearAllChannels: () => void;
}

function deduplicateMessages(messages: TransportMessage[]): TransportMessage[] {
  const seen = new Set<string>();
  return messages
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: {},
  typingUsers: {},
  unreadCounts: {},
  loadingChannels: {},
  activeSubscription: null,
  activeTypingSub: null,

  setLoading: (channelId, loading) => {
    set((state) => ({
      loadingChannels: { ...state.loadingChannels, [channelId]: loading },
    }));
  },

  setMessages: (channelId, messages) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: deduplicateMessages(messages),
      },
    }));
  },

  addMessage: (channelId, message) => {
    set((state) => {
      const existing = state.messages[channelId] || [];

      // Avoid duplicates
      if (existing.some((m) => m.id === message.id)) {
        return state;
      }

      return {
        messages: {
          ...state.messages,
          [channelId]: [...existing, message].sort(
            (a, b) => a.timestamp - b.timestamp
          ),
        },
      };
    });
  },

  setSubscription: (unsub) => {
    // Clean up previous subscription
    const prev = get().activeSubscription;
    if (prev) prev();
    set({ activeSubscription: unsub });
  },

  setTypingSubscription: (unsub) => {
    const prev = get().activeTypingSub;
    if (prev) prev();
    set({ activeTypingSub: unsub });
  },

  setTypingUsers: (channelId, users) => {
    set((state) => ({
      typingUsers: { ...state.typingUsers, [channelId]: users },
    }));
  },

  addTypingUser: (channelId, publicKey) => {
    set((state) => {
      const current = state.typingUsers[channelId] || [];
      if (current.includes(publicKey)) return state;
      return {
        typingUsers: {
          ...state.typingUsers,
          [channelId]: [...current, publicKey],
        },
      };
    });
  },

  removeTypingUser: (channelId, publicKey) => {
    set((state) => {
      const current = state.typingUsers[channelId] || [];
      return {
        typingUsers: {
          ...state.typingUsers,
          [channelId]: current.filter((k) => k !== publicKey),
        },
      };
    });
  },

  incrementUnread: (channelId) => {
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [channelId]: (state.unreadCounts[channelId] || 0) + 1,
      },
    }));
  },

  clearUnread: (channelId) => {
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [channelId]: 0 },
    }));
  },

  clearChannel: (channelId) => {
    const { activeSubscription, activeTypingSub } = get();
    if (activeSubscription) activeSubscription();
    if (activeTypingSub) activeTypingSub();

    set({
      activeSubscription: null,
      activeTypingSub: null,
    });
  },

  clearAllChannels: () => {
    const { activeSubscription, activeTypingSub } = get();
    if (activeSubscription) activeSubscription();
    if (activeTypingSub) activeTypingSub();

    set({
      messages: {},
      typingUsers: {},
      unreadCounts: {},
      activeSubscription: null,
      activeTypingSub: null,
    });
  },
}));
