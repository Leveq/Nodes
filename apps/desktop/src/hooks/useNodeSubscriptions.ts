import { useEffect, useRef } from "react";
import type { Unsubscribe, TransportMessage } from "@nodes/transport";
import { useTransport } from "../providers/TransportProvider";
import { useNodeStore } from "../stores/node-store";
import { useMessageStore } from "../stores/message-store";
import { useIdentityStore } from "../stores/identity-store";

/**
 * Hook that subscribes to all channels in the active Node for unread tracking.
 * When a new message arrives in any channel (not the active one), it increments
 * the unread count for that channel.
 */
export function useNodeSubscriptions() {
  const transport = useTransport();
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const publicKey = useIdentityStore((s) => s.publicKey);

  // Store all channel subscriptions for cleanup
  const subscriptionsRef = useRef<Unsubscribe[]>([]);
  // Track messages we've seen to distinguish history from real-time
  const seenMessagesRef = useRef<Set<string>>(new Set());
  // Track initial load state per channel
  const initialLoadDoneRef = useRef<Set<string>>(new Set());
  // Batching: pending messages to process
  const pendingMessagesRef = useRef<Map<string, TransportMessage[]>>(new Map());
  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    // Cleanup previous subscriptions
    subscriptionsRef.current.forEach((unsub) => unsub());
    subscriptionsRef.current = [];
    seenMessagesRef.current.clear();
    initialLoadDoneRef.current.clear();
    pendingMessagesRef.current.clear();
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    if (!transport || !activeNodeId) return;

    // Get channels from store (avoid subscription to channels object)
    const nodeChannels = useNodeStore.getState().channels[activeNodeId] || [];

    // Mark existing messages as seen before subscribing
    const existingMessages = useMessageStore.getState().messages;
    for (const channel of nodeChannels) {
      const channelMessages = existingMessages[channel.id] || [];
      for (const msg of channelMessages) {
        seenMessagesRef.current.add(msg.id);
      }
    }

    // Flush pending messages in batches
    const flushPending = () => {
      rafIdRef.current = null;
      const { addMessage, incrementUnread, messages } = useMessageStore.getState();
      
      for (const [channelId, pendingMsgs] of pendingMessagesRef.current) {
        const channelMessages = messages[channelId] || [];
        
        for (const message of pendingMsgs) {
          // Double-check it's not already in the store
          if (channelMessages.some((m) => m.id === message.id)) continue;
          
          addMessage(channelId, message);

          // Only increment unread for real-time messages (after initial load)
          // and only if the message is from someone else
          if (initialLoadDoneRef.current.has(channelId) && message.authorKey !== publicKey) {
            incrementUnread(channelId);
          }
        }
      }
      pendingMessagesRef.current.clear();
    };

    // Subscribe to each channel for background unread tracking
    // Note: ChannelView also subscribes to the active channel for its own view,
    // deduplication in the store handles any overlap
    for (const channel of nodeChannels) {
      const channelId = channel.id;

      const unsub = transport.message.subscribe(channelId, (message: TransportMessage) => {
        // Skip if we've already processed this message
        if (seenMessagesRef.current.has(message.id)) return;
        seenMessagesRef.current.add(message.id);

        // Queue message for batched processing
        if (!pendingMessagesRef.current.has(channelId)) {
          pendingMessagesRef.current.set(channelId, []);
        }
        pendingMessagesRef.current.get(channelId)!.push(message);

        // Schedule flush if not already scheduled
        if (rafIdRef.current === null) {
          rafIdRef.current = requestAnimationFrame(flushPending);
        }
      });

      subscriptionsRef.current.push(unsub);
      
      // Mark initial load as done after a short delay
      // (Gun fires history messages immediately on subscribe)
      setTimeout(() => {
        initialLoadDoneRef.current.add(channelId);
      }, 2000);
    }

    // Cleanup on unmount or when Node changes
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      subscriptionsRef.current.forEach((unsub) => unsub());
      subscriptionsRef.current = [];
    };
  }, [transport, activeNodeId, publicKey]);
}
