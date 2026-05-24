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
import { getCache, setCache, CacheKeys } from "../services/app-cache";

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
  addTypingUser: (conversationId: string, userId: string) => void;
  removeTypingUser: (conversationId: string, userId: string) => void;
  cleanup: () => void;
  reset: () => void;
}

const dmManager = new DMManager();

// Debounced DM message cache save (per conversation)
const dmCacheSaveTimeouts: Record<string, ReturnType<typeof setTimeout>> = {};
function saveDMMessagesToCache(conversationId: string, messages: TransportMessage[]): void {
  if (dmCacheSaveTimeouts[conversationId]) {
    clearTimeout(dmCacheSaveTimeouts[conversationId]);
  }
  dmCacheSaveTimeouts[conversationId] = setTimeout(async () => {
    const toCache = messages.slice(-100); // Keep last 100
    await setCache(CacheKeys.dmMessages(conversationId), toCache);
  }, 1000); // Debounce 1 second
}

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
    // 1. Load from IndexedDB cache first (instant render)
    const cached = await getCache<DMConversation[]>(CacheKeys.dmConversations());
    if (cached && cached.length > 0) {
      set({ conversations: cached, isLoading: false });
    } else {
      set({ isLoading: true });
    }

    try {
      // 2. Fetch from Gun (network)
      const newConversations = await dmManager.getConversations();
      
      // Merge with existing conversations to preserve preview data
      // (Gun doesn't store message previews, we compute them client-side)
      set((state) => {
        const merged = newConversations.map((newConv) => {
          const existing = state.conversations.find((c) => c.id === newConv.id);
          const base = existing
            ? {
                ...newConv,
                // Preserve preview data from local state
                lastMessagePreview: existing.lastMessagePreview || newConv.lastMessagePreview,
                lastMessageAt: Math.max(existing.lastMessageAt, newConv.lastMessageAt),
              }
            : newConv;
          return { ...base, unreadCount: state.unreadCounts[newConv.id] ?? 0 };
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
        

        // Deduplicate by id (localOnly should have no overlap, but be defensive)
        const all = [...merged, ...localOnlyStamped];
        const deduped = Array.from(new Map(all.map((c) => [c.id, c])).values());

        return { conversations: deduped, isLoading: false };

      });

      // 3. Save to cache
      await setCache(CacheKeys.dmConversations(), get().conversations);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to load DMs: ${message}`);
      set({ isLoading: false });
    }
  },

  startConversation: async (recipientKey, keypair) => {
    // Check if recipient is blocked
    const isBlocked = useSocialStore.getState().isBlocked(recipientKey);
    if (isBlocked) {
      useToastStore.getState().addToast("error", "Cannot message a blocked user.");
      throw new Error("Cannot DM blocked user");
    }

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
              lastReadAt: Date.now(),
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

    // 1. Load from IndexedDB cache first (instant render)
    const cached = await getCache<TransportMessage[]>(CacheKeys.dmMessages(conversationId));
    if (cached && cached.length > 0) {
      set((state) => ({
        messages: { ...state.messages, [conversationId]: cached },
      }));
    } else {
      set({ isLoading: true });
    }

    try {
      const epub = await get().resolveEpub(recipientKey);

      // 2. Load history from Gun (network)
      const history = await dmManager.getHistory(conversationId, epub, keypair, 50);
      set((state) => ({
        messages: { ...state.messages, [conversationId]: history },
        isLoading: false,
      }));

      // 3. Save to cache (last 100 messages)
      const toCache = history.slice(-100);
      await setCache(CacheKeys.dmMessages(conversationId), toCache);

      // Subscribe to new messages
      const messageSub = dmManager.subscribe(
        conversationId,
        epub,
        keypair,
        (message) => {
          // Guard: if user has switched away, discard stale subscription events
          if (get().activeConversationId !== conversationId) return;

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

    // Check if recipient is blocked
    const isBlocked = useSocialStore.getState().isBlocked(recipientKey);
    if (isBlocked) {
      useToastStore.getState().addToast("error", "Cannot send message to a blocked user.");
      return;
    }

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

      const newMessages = [...existing, message].sort(
        (a, b) => a.timestamp - b.timestamp
      );

      // Save to IndexedDB cache (debounced)
      saveDMMessagesToCache(conversationId, newMessages);

      return {
        messages: {
          ...state.messages,
          [conversationId]: newMessages,
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
    set((state) => {
      const newCount = (state.unreadCounts[conversationId] || 0) + 1;
      return {
        unreadCounts: {
          ...state.unreadCounts,
          [conversationId]: newCount,
        },
        conversations: state.conversations.map((c) =>
          c.id === conversationId ? { ...c, unreadCount: newCount } : c
        ),
      };
    });
  },

  clearUnread: (conversationId) => {
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [conversationId]: 0 },
      conversations: state.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      ),
    }));
  },

  addTypingUser: (conversationId, userId) => {
    set((state) => {
      const current = state.typingUsers[conversationId] || [];
      if (current.includes(userId)) return state;
      return {
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: [...current, userId],
        },
      };
    });
  },

  removeTypingUser: (conversationId, userId) => {
    set((state) => {
      const current = state.typingUsers[conversationId] || [];
      return {
        typingUsers: {
          ...state.typingUsers,
          [conversationId]: current.filter((id) => id !== userId),
        },
      };
    });
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
    // Update cache (fire and forget)
    setCache(CacheKeys.dmConversations(), get().conversations);
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
