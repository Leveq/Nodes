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
  reset: () => void;
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
    set((state) => {
      const existing = state.messages[channelId] || [];
      
      // Merge new messages with existing, keeping both
      // This prevents history from overwriting newer subscription messages
      const messageMap = new Map<string, TransportMessage>();
      
      // Add existing messages first
      for (const msg of existing) {
        messageMap.set(msg.id, msg);
      }
      
      // Add/update with new messages (prefer newer data)
      for (const msg of messages) {
        const existingMsg = messageMap.get(msg.id);
        if (existingMsg) {
          // Keep the message with better data - prefer non-empty content
          const merged: TransportMessage = {
            ...existingMsg,
            content: msg.content || existingMsg.content,
            ...(msg.replyTo !== undefined && { replyTo: msg.replyTo }),
            ...(msg.edited !== undefined && { edited: msg.edited }),
            ...(msg.editedAt !== undefined && { editedAt: msg.editedAt }),
            ...(msg.editHistory !== undefined && { editHistory: msg.editHistory }),
            ...(msg.deleted !== undefined && { deleted: msg.deleted }),
            ...(msg.deletedAt !== undefined && { deletedAt: msg.deletedAt }),
            ...(msg.deletedBy !== undefined && { deletedBy: msg.deletedBy }),
            ...(msg.attachments && { attachments: msg.attachments }),
            ...(msg.signature && { signature: msg.signature }),
          };
          messageMap.set(msg.id, merged);
        } else {
          messageMap.set(msg.id, msg);
        }
      }
      
      const mergedMessages = Array.from(messageMap.values());
      
      return {
        messages: {
          ...state.messages,
          [channelId]: deduplicateMessages(mergedMessages),
        },
      };
    });
  },

  addMessage: (channelId, message) => {
    set((state) => {
      const existing = state.messages[channelId] || [];

      // Check if message already exists
      const existingIndex = existing.findIndex((m) => m.id === message.id);
      if (existingIndex !== -1) {
        const existingMsg = existing[existingIndex];
        
        // Smart merge: only update fields that have meaningful new values
        // Don't overwrite good content with empty content
        const merged: TransportMessage = {
          ...existingMsg,
          // Only update content if new content is non-empty
          content: message.content || existingMsg.content,
          // Update optional fields only if they exist in new message
          ...(message.replyTo !== undefined && { replyTo: message.replyTo }),
          ...(message.edited !== undefined && { edited: message.edited }),
          ...(message.editedAt !== undefined && { editedAt: message.editedAt }),
          ...(message.editHistory !== undefined && { editHistory: message.editHistory }),
          ...(message.deleted !== undefined && { deleted: message.deleted }),
          ...(message.deletedAt !== undefined && { deletedAt: message.deletedAt }),
          ...(message.deletedBy !== undefined && { deletedBy: message.deletedBy }),
          ...(message.attachments && { attachments: message.attachments }),
          ...(message.signature && { signature: message.signature }),
        };
        
        const updated = [...existing];
        updated[existingIndex] = merged;
        return {
          messages: {
            ...state.messages,
            [channelId]: updated,
          },
        };
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

  clearChannel: (_channelId) => {
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

  reset: () => {
    const { activeSubscription, activeTypingSub } = get();
    if (activeSubscription) activeSubscription();
    if (activeTypingSub) activeTypingSub();

    set({
      messages: {},
      typingUsers: {},
      unreadCounts: {},
      loadingChannels: {},
      activeSubscription: null,
      activeTypingSub: null,
    });
  },
}));
