import { create } from "zustand";
import type { TransportMessage, Unsubscribe } from "@nodes/transport";
import { getCache, setCache, CacheKeys, MAX_CACHED_MESSAGES } from "../services/app-cache";

// Persisted delivery status by message id so the pending/failed indicator
// survives reloads and node/channel switches (messages are reloaded from cache
// and Gun history, which carry no delivery status).
type PersistedDeliveryStatus = "sending" | "failed";
const DELIVERY_STATUS_KEY = "nodes:msg-delivery-status";

function loadDeliveryStatuses(): Record<string, PersistedDeliveryStatus> {
  try {
    const raw = localStorage.getItem(DELIVERY_STATUS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const deliveryStatusMap: Record<string, PersistedDeliveryStatus> = loadDeliveryStatuses();

function persistDeliveryStatuses(): void {
  try {
    localStorage.setItem(DELIVERY_STATUS_KEY, JSON.stringify(deliveryStatusMap));
  } catch {
    /* ignore quota / unavailable storage */
  }
}

// Re-attach the persisted delivery status to a message coming from cache/history.
function withDeliveryStatus(msg: TransportMessage): TransportMessage {
  const persisted = deliveryStatusMap[msg.id];
  if (persisted) {
    return msg.deliveryStatus === persisted ? msg : { ...msg, deliveryStatus: persisted };
  }
  // No longer tracked as pending/failed (delivered) — clear any stale status.
  if (msg.deliveryStatus === "sending" || msg.deliveryStatus === "failed") {
    return { ...msg, deliveryStatus: undefined };
  }
  return msg;
}

// Persist a message's pending/failed status by id.
function registerDeliveryStatus(id: string, status: TransportMessage["deliveryStatus"]): void {
  if (status === "sending" || status === "failed") {
    if (deliveryStatusMap[id] !== status) {
      deliveryStatusMap[id] = status;
      persistDeliveryStatuses();
    }
  } else if (deliveryStatusMap[id]) {
    delete deliveryStatusMap[id];
    persistDeliveryStatuses();
  }
}

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
  setMessageStatus: (channelId: string, messageId: string, status: TransportMessage["deliveryStatus"]) => void;
  // Confirm delivery for all still-pending own messages (called once connected).
  markSendingAsSent: () => void;
  setSubscription: (unsub: Unsubscribe | null) => void;
  setTypingSubscription: (unsub: Unsubscribe | null) => void;
  setTypingUsers: (channelId: string, users: string[]) => void;
  addTypingUser: (channelId: string, publicKey: string) => void;
  removeTypingUser: (channelId: string, publicKey: string) => void;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
  clearChannel: (channelId: string) => void;
  clearAllChannels: () => void;
  
  // Cache actions
  loadFromCache: (channelId: string) => Promise<boolean>; // Returns true if cache hit
  saveToCache: (channelId: string) => Promise<void>;
  
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
      for (const raw of messages) {
        const msg = withDeliveryStatus(raw);
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
            ...(msg.signedBy && { signedBy: msg.signedBy }),
            ...(msg.verified !== undefined && { verified: msg.verified }),
          };
          messageMap.set(msg.id, withDeliveryStatus(merged));
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
    // Persist an optimistic pending/failed status so it survives reloads.
    registerDeliveryStatus(message.id, message.deliveryStatus);
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
          ...(message.signedBy && { signedBy: message.signedBy }),
          ...(message.verified !== undefined && { verified: message.verified }),
        };
        
        const updated = [...existing];
        updated[existingIndex] = withDeliveryStatus(merged);
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
          [channelId]: [...existing, withDeliveryStatus(message)].sort(
            (a, b) => a.timestamp - b.timestamp
          ),
        },
      };
    });
  },

  setMessageStatus: (channelId, messageId, status) => {
    registerDeliveryStatus(messageId, status);
    set((state) => {
      const existing = state.messages[channelId];
      if (!existing) return {};
      const idx = existing.findIndex((m) => m.id === messageId);
      if (idx === -1) return {};
      const updated = [...existing];
      updated[idx] = { ...updated[idx], deliveryStatus: status };
      return { messages: { ...state.messages, [channelId]: updated } };
    });
  },

  markSendingAsSent: () => {
    // Clear persisted 'sending' entries (leave 'failed' so retry stays visible).
    let mapChanged = false;
    for (const [id, s] of Object.entries(deliveryStatusMap)) {
      if (s === "sending") {
        delete deliveryStatusMap[id];
        mapChanged = true;
      }
    }
    if (mapChanged) persistDeliveryStatuses();
    set((state) => {
      let changed = false;
      const next: Record<string, TransportMessage[]> = {};
      for (const [channelId, msgs] of Object.entries(state.messages)) {
        let channelChanged = false;
        const updated = msgs.map((m) => {
          if (m.deliveryStatus === "sending") {
            channelChanged = true;
            return { ...m, deliveryStatus: "sent" as const };
          }
          return m;
        });
        next[channelId] = channelChanged ? updated : msgs;
        if (channelChanged) changed = true;
      }
      return changed ? { messages: next } : {};
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

  loadFromCache: async (channelId) => {
    const cached = await getCache<TransportMessage[]>(CacheKeys.messages(channelId));
    if (cached && cached.length > 0) {
      const restored = cached.map(withDeliveryStatus);
      set((state) => ({
        messages: { ...state.messages, [channelId]: restored },
      }));
      return true;
    }
    return false;
  },

  saveToCache: async (channelId) => {
    const messages = get().messages[channelId];
    if (!messages || messages.length === 0) return;
    
    // Only cache the last N messages to keep cache size manageable. Strip the
    // ephemeral deliveryStatus — it is restored from its own persisted map.
    const toCache = messages.slice(-MAX_CACHED_MESSAGES).map((m) =>
      m.deliveryStatus ? { ...m, deliveryStatus: undefined } : m
    );
    await setCache(CacheKeys.messages(channelId), toCache);
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
