import { useEffect, useRef, useCallback } from "react";
import type { Unsubscribe, TransportMessage } from "@nodes/transport";
import { useDMStore } from "../stores/dm-store";
import { useIdentityStore } from "../stores/identity-store";
import { useNavigationStore } from "../stores/navigation-store";
import { DMManager } from "@nodes/transport-gun";
import type { KeyPair } from "@nodes/crypto";
import { getSearchIndex } from "../services/search-index";

const dmManager = new DMManager();

// Pending message type for batching
interface PendingDMMessage {
  conversationId: string;
  recipientKey: string;
  message: TransportMessage;
  myPublicKey: string;
}

/**
 * Hook that subscribes to all DM conversations for unread tracking.
 * When a new message arrives in any conversation (not the active one),
 * it increments the unread count for that conversation.
 */
export function useDMSubscriptions() {
  const conversations = useDMStore((s) => s.conversations);
  const activeConversationId = useDMStore((s) => s.activeConversationId);
  const isAuthenticated = useIdentityStore((s) => s.isAuthenticated);
  const keypair = useIdentityStore((s) => s.keypair);
  const publicKey = useIdentityStore((s) => s.publicKey);

  // Store all conversation subscriptions for cleanup
  const subscriptionsRef = useRef<Map<string, Unsubscribe>>(new Map());
  // Track messages we've seen to distinguish history from real-time
  const seenMessagesRef = useRef<Set<string>>(new Set());
  // Track initial load state per conversation
  const initialLoadDoneRef = useRef<Set<string>>(new Set());
  // Track unread count during initial load (messages after lastReadAt)
  const pendingUnreadRef = useRef<Map<string, number>>(new Map());
  // Track lastReadAt per conversation for calculating initial unread
  const lastReadAtRef = useRef<Map<string, number>>(new Map());
  // Batching: pending messages to process
  const pendingMessagesRef = useRef<PendingDMMessage[]>([]);
  const rafIdRef = useRef<number | null>(null);
  // Monotonically increasing id to guard stale async startSubscription calls
  const runIdRef = useRef<number>(0);
  // Track initial-load timeout ids so they can be cleared
  const initialLoadTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Process a single message (extracted for batching)
  const processMessage = useCallback((conversationId: string, recipientKey: string, message: TransportMessage, myPublicKey: string) => {
    const currentState = useDMStore.getState();
    
    // Double-check it's not already in the store
    const convMessages = currentState.messages[conversationId] || [];
    if (convMessages.some((m) => m.id === message.id)) return;

    // Add message to store
    currentState.addMessage(conversationId, message);
    
    // Index DM message for search (content is already decrypted)
    if (message.type !== "system") {
      const searchIndex = getSearchIndex();
      searchIndex.addDM(
        {
          id: message.id,
          encrypted: "", // Not stored
          timestamp: message.timestamp,
          authorKey: message.authorKey,
          conversationId: conversationId,
          type: message.type as "text" | "system" | "file",
        },
        message.content // Pass decrypted content
      );
    }

    const isFromOther = message.authorKey !== myPublicKey;
    
    // User is "not viewing" if they're not in DM mode at all, OR they're viewing a different conversation
    const viewMode = useNavigationStore.getState().viewMode;
    const isInDMView = viewMode === "dm";
    const isViewingThisConversation = isInDMView && currentState.activeConversationId === conversationId;
    const isNotViewing = !isViewingThisConversation;
    
    const initialLoadDone = initialLoadDoneRef.current.has(conversationId);

    // During initial load: count unread messages (after lastReadAt)
    if (!initialLoadDone) {
      if (isFromOther) {
        const lastReadAt = lastReadAtRef.current.get(conversationId) || 0;
        if (message.timestamp > lastReadAt) {
          const current = pendingUnreadRef.current.get(conversationId) || 0;
          pendingUnreadRef.current.set(conversationId, current + 1);
        }
      }
    } else {
      // After initial load: increment unread for real-time messages
      if (isFromOther && isNotViewing) {
        currentState.incrementUnread(conversationId);
      }
    }

    // Update conversation preview - get fresh conversation data
    const currentConv = currentState.conversations.find((c) => c.id === conversationId);
    if (currentConv) {
      currentState.updateConversation({
        ...currentConv,
        lastMessageAt: message.timestamp,
        lastMessagePreview: message.content.substring(0, 50),
      });
    } else {
      // Conversation not in list yet, add it
      currentState.updateConversation({
        id: conversationId,
        recipientKey,
        startedAt: message.timestamp,
        lastMessageAt: message.timestamp,
        lastMessagePreview: message.content.substring(0, 50),
        unreadCount: 0,
      });
    }
  }, []);

  // Flush pending messages in batch
  const flushPending = useCallback(() => {
    rafIdRef.current = null;
    const pending = pendingMessagesRef.current;
    pendingMessagesRef.current = [];
    
    for (const { conversationId, recipientKey, message, myPublicKey } of pending) {
      processMessage(conversationId, recipientKey, message, myPublicKey);
    }
  }, [processMessage]);

  // Handle message with batching
  const handleMessage = useCallback((conversationId: string, recipientKey: string, message: TransportMessage, myPublicKey: string) => {
    // Skip if we've already processed this message
    if (seenMessagesRef.current.has(message.id)) return;
    seenMessagesRef.current.add(message.id);

    // Queue for batched processing
    pendingMessagesRef.current.push({ conversationId, recipientKey, message, myPublicKey });

    // Schedule flush if not already scheduled
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(flushPending);
    }
  }, [flushPending]);

  useEffect(() => {
    if (!isAuthenticated || !keypair || !publicKey) return;

    const runId = ++runIdRef.current;

    // Unsubscribe from active conversation (DMView handles it)
    if (activeConversationId && subscriptionsRef.current.has(activeConversationId)) {
      subscriptionsRef.current.get(activeConversationId)?.();
      subscriptionsRef.current.delete(activeConversationId);
    }

    // Subscribe to each conversation we're not actively viewing
    for (const conv of conversations) {
      // Skip if already subscribed (or subscription in progress)
      if (subscriptionsRef.current.has(conv.id)) continue;
      
      // Skip the active conversation - DMView handles that
      if (conv.id === activeConversationId) continue;

      // Capture values for this subscription
      const convId = conv.id;
      const recipientKey = conv.recipientKey;
      const myKey = publicKey;
      const lastReadAt = conv.lastReadAt || 0;

      // Store lastReadAt for use in handleMessage during initial load
      lastReadAtRef.current.set(convId, lastReadAt);
      // Reset pending unread count
      pendingUnreadRef.current.set(convId, 0);

      // Mark as "subscribing" immediately to prevent duplicate subscriptions
      // (the actual unsub function will replace this placeholder)
      subscriptionsRef.current.set(convId, () => {});

      // Capture the current run id before the async call
      const capturedRunId = runId;

      // We need the recipient's epub to decrypt messages
      const startSubscription = async () => {
        try {
          const state = useDMStore.getState();
          const epub = state.epubCache[recipientKey] || await state.resolveEpub(recipientKey);

          // Stale guard: abort if a newer effect run has started
          if (runIdRef.current !== capturedRunId) {
            return;
          }
          
          // Mark existing messages as seen before subscribing
          const existingMessages = state.messages[convId] || [];
          for (const msg of existingMessages) {
            seenMessagesRef.current.add(msg.id);
          }
          
          const unsub = dmManager.subscribe(
            convId,
            epub,
            keypair as KeyPair,
            (message: TransportMessage) => {
              handleMessage(convId, recipientKey, message, myKey);
            }
          );

          // Replace placeholder with real unsub function
          subscriptionsRef.current.set(convId, unsub);
          
          // Mark initial load as done after a short delay
          // (Gun fires history messages immediately on subscribe)
          // Then apply the accumulated unread count
          const timerId = setTimeout(() => {
            initialLoadTimersRef.current.delete(convId);
            initialLoadDoneRef.current.add(convId);
            
            // Apply accumulated unread count from initial load
            const unreadCount = pendingUnreadRef.current.get(convId) || 0;
            if (unreadCount > 0) {
              // Only set if not currently viewing this conversation
              const currentState = useDMStore.getState();
              const viewMode = useNavigationStore.getState().viewMode;
              const isInDMView = viewMode === "dm";
              const isViewingThisConversation = isInDMView && currentState.activeConversationId === convId;
              
              if (!isViewingThisConversation) {
                // Set the unread count directly (not increment)
                useDMStore.setState((s) => ({
                  unreadCounts: {
                    ...s.unreadCounts,
                    [convId]: unreadCount,
                  },
                }));
              }
            }
          }, 2000);
          initialLoadTimersRef.current.set(convId, timerId);
        } catch {
          // Remove placeholder on failure so we can retry later
          subscriptionsRef.current.delete(convId);
          console.warn(`Failed to subscribe to DM ${convId}: Could not resolve epub`);
        }
      };

      startSubscription();
    }

    // Cleanup subscriptions for conversations we no longer have
    const currentSubs = subscriptionsRef.current;
    for (const [convId, unsub] of currentSubs) {
      if (!conversations.some((c) => c.id === convId)) {
        unsub();
        currentSubs.delete(convId);
        initialLoadDoneRef.current.delete(convId);
        const timerId = initialLoadTimersRef.current.get(convId);
        if (timerId !== undefined) {
          clearTimeout(timerId);
          initialLoadTimersRef.current.delete(convId);
        }
      }
    }

    return () => {
      // Clear all pending initial-load timeouts when the effect reruns
      initialLoadTimersRef.current.forEach((timerId) => clearTimeout(timerId));
      initialLoadTimersRef.current.clear();
    };
  }, [conversations, activeConversationId, isAuthenticated, keypair, publicKey, handleMessage]);

  // Subscribe to new incoming DMs (from inbox)
  useEffect(() => {
    if (!isAuthenticated || !keypair || !publicKey) return;

    const unsub = dmManager.subscribeConversations((newConv) => {
      // Check if we already have this conversation
      const existingConvs = useDMStore.getState().conversations;
      if (!existingConvs.some((c) => c.id === newConv.id)) {
        useDMStore.getState().updateConversation(newConv);
      }
    }, publicKey);

    return () => {
      unsub();
    };
  }, [isAuthenticated, keypair, publicKey]);

  // Periodic poll for new conversations (fallback for Gun subscription issues)
  useEffect(() => {
    if (!isAuthenticated || !keypair || !publicKey) return;

    const pollInterval = setInterval(async () => {
      try {
        const serverConversations = await dmManager.getConversations();
        const localConversations = useDMStore.getState().conversations;
        
        for (const serverConv of serverConversations) {
          if (!localConversations.some((c) => c.id === serverConv.id)) {
            useDMStore.getState().updateConversation(serverConv);
          }
        }
      } catch (err) {
        console.error("[useDMSubscriptions] Poll error:", err);
      }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(pollInterval);
  }, [isAuthenticated, keypair, publicKey]);

  // Cleanup on unmount
  useEffect(() => {
    const subs = subscriptionsRef.current;
    const seen = seenMessagesRef.current;
    const initial = initialLoadDoneRef.current;
    const pending = pendingUnreadRef.current;
    const lastRead = lastReadAtRef.current;
    const timers = initialLoadTimersRef.current;
    
    return () => {
      // Cancel any pending batch flush
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingMessagesRef.current = [];

      timers.forEach((timerId) => clearTimeout(timerId));
      timers.clear();
      
      subs.forEach((unsub) => unsub());
      subs.clear();
      seen.clear();
      initial.clear();
      pending.clear();
      lastRead.clear();
    };
  }, []);
}
