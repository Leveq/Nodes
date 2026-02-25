import { create } from "zustand";
import { DMManager } from "@nodes/transport-gun";
import { DMCrypto } from "@nodes/crypto";
import type { KeyPair } from "@nodes/crypto";
import type { DMConversation } from "@nodes/core";
import type { TransportMessage, Unsubscribe } from "@nodes/transport";
import { useToastStore } from "./toast-store";
import { useSocialStore } from "./social-store";
import { useIdentityStore } from "./identity-store";
import { useNavigationStore } from "./navigation-store";

interface DMState {
  // State
  conversations: DMConversation[];
  activeConversationId: string | null;
  messages: Record<string, TransportMessage[]>;
  typingUsers: Record<string, string[]>;
  unreadCounts: Record<string, number>;
  isLoading: boolean;

  // Recipient epub cache (needed for encryption)
  epubCache: Record<string, string>; // publicKey → epub

  // Active subscriptions
  activeMessageSub: Unsubscribe | null;
  activeTypingSub: Unsubscribe | null;

  // Actions
  loadConversations: () => Promise<void>;
  startConversation: (recipientKey: string, keypair: KeyPair) => Promise<string>;
  setActiveConversation: (
    conversationId: string | null,
    recipientKey?: string,
    keypair?: KeyPair
  ) => Promise<void>;
  sendMessage: (
    content: string,
    recipientKey: string,
    keypair: KeyPair
  ) => Promise<void>;
  addMessage: (conversationId: string, message: TransportMessage) => void;
  setMessages: (conversationId: string, messages: TransportMessage[]) => void;
  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
  resolveEpub: (publicKey: string) => Promise<string>;
  updateConversation: (conversation: DMConversation) => void;
  cleanup: () => void;
  reset: () => void;
}

const dmManager = new DMManager();

export const useDMStore = create<DMState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  typingUsers: {},
  unreadCounts: {},
  isLoading: false,
  epubCache: {},
  activeMessageSub: null,
  activeTypingSub: null,

  loadConversations: async () => {
    set({ isLoading: true });
    try {
      const newConversations = await dmManager.getConversations();
      
      // Merge with existing conversations to preserve preview data
      // (Gun doesn't store message previews, we compute them client-side)
      set((state) => {
        const merged = newConversations.map((newConv) => {
          const existing = state.conversations.find((c) => c.id === newConv.id);
          if (existing) {
            return {
              ...newConv,
              // Preserve preview data from local state
              lastMessagePreview: existing.lastMessagePreview || newConv.lastMessagePreview,
              lastMessageAt: Math.max(existing.lastMessageAt, newConv.lastMessageAt),
            };
          }
          return newConv;
        });
        
        // Also include any conversations that exist locally but weren't in Gun
        // (shouldn't happen, but defensive)
        const localOnly = state.conversations.filter(
          (c) => !newConversations.some((nc) => nc.id === c.id)
        );
        const localOnlyStamped = localOnly.map((c) => ({
          ...c,
          unreadCount: state.unreadCounts[c.id] ?? 0,
        }));
        
        return { conversations: [...merged, ...localOnlyStamped], isLoading: false };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to load DMs: ${message}`);
      set({ isLoading: false });
    }
  },

  startConversation: async (recipientKey, keypair) => {
    // Check if recipient is a friend (DMs are gated behind friend system)
    const isFriend = useSocialStore.getState().isFriend(recipientKey);
    if (!isFriend) {
      useToastStore.getState().addToast("error", "You can only message friends. Send a friend request first.");
      throw new Error("DM requires friend relationship");
    }

    try {
      // Resolve epub first (validates the recipient exists)
      await get().resolveEpub(recipientKey);

      const conversationId = await dmManager.startConversation(recipientKey, keypair);

      // Add to conversation list if not already there
      set((state) => {
        const exists = state.conversations.some((c) => c.id === conversationId);
        if (exists) return state;

        return {
          conversations: [
            {
              id: conversationId,
              recipientKey,
              startedAt: Date.now(),
              lastMessageAt: Date.now(),
              lastMessagePreview: "",
              unreadCount: 0,
            },
            ...state.conversations,
          ],
        };
      });

      return conversationId;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to start DM: ${message}`);
      throw err;
    }
  },

  setActiveConversation: async (conversationId, recipientKey, keypair) => {
    // Clean up previous subscriptions
    const { activeMessageSub, activeTypingSub } = get();
    if (activeMessageSub) activeMessageSub();
    if (activeTypingSub) activeTypingSub();

    set({
      activeConversationId: conversationId,
      activeMessageSub: null,
      activeTypingSub: null,
    });

    if (!conversationId || !recipientKey || !keypair) return;

    set({ isLoading: true });

    try {
      const epub = await get().resolveEpub(recipientKey);

      // Load history
      const history = await dmManager.getHistory(conversationId, epub, keypair, 50);
      set((state) => ({
        messages: { ...state.messages, [conversationId]: history },
        isLoading: false,
      }));

      // Subscribe to new messages
      const messageSub = dmManager.subscribe(
        conversationId,
        epub,
        keypair,
        (message) => {
          const currentState = get();
          
          // Check if message already exists
          const convMessages = currentState.messages[conversationId] || [];
          if (convMessages.some((m) => m.id === message.id)) return;
          
          currentState.addMessage(conversationId, message);
          
          // Track unread if message is from other user AND we're not actively viewing this conversation
          const myPublicKey = useIdentityStore.getState().publicKey;
          const isFromOther = message.authorKey !== myPublicKey;
          
          // User is "not viewing" if they're not in DM mode at all, OR they're viewing a different conversation
          const viewMode = useNavigationStore.getState().viewMode;
          const isInDMView = viewMode === "dm";
          const isViewingThisConversation = isInDMView && currentState.activeConversationId === conversationId;
          const isNotViewing = !isViewingThisConversation;
          
          if (isFromOther && isNotViewing) {
            currentState.incrementUnread(conversationId);
          }
        }
      );

      set({ activeMessageSub: messageSub });

      // Clear unread count and update lastReadAt
      get().clearUnread(conversationId);
      const now = Date.now();
      await dmManager.markAsRead(conversationId);
      
      // Also update local conversation's lastReadAt so subsequent subscriptions use correct value
      const currentConv = get().conversations.find((c) => c.id === conversationId);
      if (currentConv) {
        get().updateConversation({ ...currentConv, lastReadAt: now });
      }
    } catch (err: unknown) {
      console.error("[DMStore] Error in setActiveConversation:", err);
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to load DM: ${message}`);
      set({ isLoading: false });
    }
  },

  sendMessage: async (content, recipientKey, keypair) => {
    const { activeConversationId } = get();
    if (!activeConversationId) return;

    try {
      const epub = await get().resolveEpub(recipientKey);

      const message = await dmManager.sendMessage(
        activeConversationId,
        content,
        epub,
        keypair,
        recipientKey // Pass recipient key for inbox notification
      );

      // Add to local messages (already decrypted)
      get().addMessage(activeConversationId, message);

      // Update conversation last message
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === activeConversationId
            ? {
                ...c,
                lastMessageAt: Date.now(),
                lastMessagePreview: content.substring(0, 50),
              }
            : c
        ),
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to send DM: ${message}`);
      throw err;
    }
  },

  addMessage: (conversationId, message) => {
    set((state) => {
      const existing = state.messages[conversationId] || [];
      if (existing.some((m) => m.id === message.id)) return state;

      // Update conversation's last message preview
      const updatedConversations = state.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              lastMessageAt: message.timestamp,
              lastMessagePreview: message.content.substring(0, 50),
            }
          : c
      );

      return {
        messages: {
          ...state.messages,
          [conversationId]: [...existing, message].sort(
            (a, b) => a.timestamp - b.timestamp
          ),
        },
        conversations: updatedConversations,
      };
    });
  },

  setMessages: (conversationId, messages) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [conversationId]: messages,
      },
    }));
  },

  incrementUnread: (conversationId) => {
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [conversationId]: (state.unreadCounts[conversationId] || 0) + 1,
      },
    }));
  },

  clearUnread: (conversationId) => {
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [conversationId]: 0 },
    }));
  },

  resolveEpub: async (publicKey) => {
    const cached = get().epubCache[publicKey];
    if (cached) return cached;

    const epub = await dmManager.getRecipientEpub(publicKey);
    set((state) => ({
      epubCache: { ...state.epubCache, [publicKey]: epub },
    }));
    return epub;
  },

  updateConversation: (conversation) => {
    set((state) => {
      const exists = state.conversations.some((c) => c.id === conversation.id);
      if (exists) {
        return {
          conversations: state.conversations.map((c) =>
            c.id === conversation.id ? { ...c, ...conversation } : c
          ),
        };
      }
      return {
        conversations: [conversation, ...state.conversations],
      };
    });
  },

  cleanup: () => {
    const { activeMessageSub, activeTypingSub } = get();
    if (activeMessageSub) activeMessageSub();
    if (activeTypingSub) activeTypingSub();
    dmManager.cleanup();
    set({
      activeConversationId: null,
      activeMessageSub: null,
      activeTypingSub: null,
      messages: {},
      typingUsers: {},
      unreadCounts: {},
    });
  },

  reset: () => {
    const { activeMessageSub, activeTypingSub } = get();
    if (activeMessageSub) activeMessageSub();
    if (activeTypingSub) activeTypingSub();
    dmManager.cleanup();
    set({
      conversations: [],
      activeConversationId: null,
      messages: {},
      typingUsers: {},
      unreadCounts: {},
      isLoading: false,
      epubCache: {},
      activeMessageSub: null,
      activeTypingSub: null,
    });
  },
}));

// Re-export for use by components that need to generate conversation IDs
export { DMCrypto };
