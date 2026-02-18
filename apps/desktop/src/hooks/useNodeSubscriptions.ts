import { useEffect, useRef } from "react";
import type { Unsubscribe, TransportMessage } from "@nodes/transport";
import { useTransport } from "../providers/TransportProvider";
import { useNodeStore } from "../stores/node-store";
import { useMessageStore } from "../stores/message-store";
import { useIdentityStore } from "../stores/identity-store";
import { getSearchIndex } from "../services/search-index";
import { processMessageForNotification } from "../services/notification-manager";
import { isMessageRelevantToUser } from "@nodes/core";
import { NodeManager } from "@nodes/transport-gun";

const nodeManager = new NodeManager();

/**
 * Hook that subscribes to ALL channels across ALL nodes for:
 * - Unread count tracking
 * - Notification processing (mentions, @everyone, etc.)
 * 
 * This runs at the app level to ensure notifications work even when
 * the user is viewing a different node.
 */
export function useNodeSubscriptions() {
  const transport = useTransport();
  const nodes = useNodeStore((s) => s.nodes);
  const allChannels = useNodeStore((s) => s.channels);
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
  // Map channel ID to node info for notifications
  const channelToNodeRef = useRef<Map<string, { nodeId: string; nodeName: string }>>(new Map());

  useEffect(() => {
    if (!transport || nodes.length === 0) {
      return;
    }

    // Cleanup previous subscriptions
    subscriptionsRef.current.forEach((unsub) => unsub());
    subscriptionsRef.current = [];
    seenMessagesRef.current.clear();
    initialLoadDoneRef.current.clear();
    pendingMessagesRef.current.clear();
    channelToNodeRef.current.clear();
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }

    // Build channel -> node mapping and collect all channels
    const allChannelsList: Array<{ channelId: string; nodeId: string; nodeName: string; channelName: string }> = [];
    
    for (const node of nodes) {
      const nodeChannels = allChannels[node.id] || [];
      for (const channel of nodeChannels) {
        channelToNodeRef.current.set(channel.id, { nodeId: node.id, nodeName: node.name });
        allChannelsList.push({
          channelId: channel.id,
          nodeId: node.id,
          nodeName: node.name,
          channelName: channel.name,
        });
      }
    }

    // Mark existing messages as seen before subscribing
    const existingMessages = useMessageStore.getState().messages;
    for (const { channelId } of allChannelsList) {
      const channelMessages = existingMessages[channelId] || [];
      for (const msg of channelMessages) {
        seenMessagesRef.current.add(msg.id);
      }
    }

    // Flush pending messages in batches
    const flushPending = () => {
      rafIdRef.current = null;
      const { addMessage, incrementUnread, messages } = useMessageStore.getState();
      const searchIndex = getSearchIndex();
      
      for (const [channelId, pendingMsgs] of pendingMessagesRef.current) {
        const channelMessages = messages[channelId] || [];
        const nodeInfo = channelToNodeRef.current.get(channelId);
        
        for (const message of pendingMsgs) {
          // Check if already in store (ChannelView might have added it)
          const alreadyInStore = channelMessages.some((m) => m.id === message.id);
          
          if (!alreadyInStore) {
            addMessage(channelId, message);
            
            // Index message for search (if index is ready)
            if (nodeInfo && message.type !== "system") {
              searchIndex.addMessage(
                {
                  id: message.id,
                  content: message.content,
                  timestamp: message.timestamp,
                  authorKey: message.authorKey,
                  channelId: channelId,
                  type: message.type as "text" | "system" | "file",
                },
                nodeInfo.nodeId
              );
            }
          }

          // Always process notifications for real-time messages (after initial load)
          // even if message was already in store from ChannelView
          const isInitialLoadDone = initialLoadDoneRef.current.has(channelId);
          const isFromOther = message.authorKey !== publicKey;
          
          console.log("[NodeSubscriptions] Checking notification eligibility:", { 
            messageId: message.id, 
            isInitialLoadDone, 
            isFromOther,
            authorKey: message.authorKey?.slice(0, 10),
            myKey: publicKey?.slice(0, 10)
          });
          
          if (isInitialLoadDone && isFromOther) {
            console.log("[NodeSubscriptions] Incrementing unread for channel:", channelId);
            incrementUnread(channelId);
            
            // Process for notifications if message mentions user
            // Deduplication happens in notification-store.addNotification()
            const isRelevant = isMessageRelevantToUser(message.content, publicKey || "");
            console.log("[NodeSubscriptions] Message relevance:", isRelevant, "content:", message.content.slice(0, 30));
            
            if (nodeInfo && isRelevant) {
              // Find channel name
              const nodeChannels = allChannels[nodeInfo.nodeId] || [];
              const channel = nodeChannels.find((c) => c.id === channelId);
              
              processMessageForNotification(message, {
                nodeId: nodeInfo.nodeId,
                nodeName: nodeInfo.nodeName,
                channelId: channelId,
                channelName: channel?.name || "unknown",
                senderName: message.authorKey.slice(0, 8), // Fallback, manager will look up
              });
            }
          }
        }
      }
      pendingMessagesRef.current.clear();
    };

    // Subscribe to ALL channels across ALL nodes
    for (const { channelId } of allChannelsList) {
      const unsub = transport.message.subscribe(channelId, (message: TransportMessage) => {
        // Skip if we've already processed this message
        if (seenMessagesRef.current.has(message.id)) {
          return;
        }
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

    // Cleanup on unmount or when nodes change
    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      subscriptionsRef.current.forEach((unsub) => unsub());
      subscriptionsRef.current = [];
    };
  }, [transport, publicKey, allChannels, nodes]);

  // Subscribe to channel list changes for real-time channel creation detection
  const channelSubsRef = useRef<Map<string, () => void>>(new Map());
  
  useEffect(() => {
    if (nodes.length === 0) return;

    // Subscribe to each node's channel list
    for (const node of nodes) {
      // Skip if already subscribed
      if (channelSubsRef.current.has(node.id)) continue;

      const unsub = nodeManager.subscribeChannelChanges(node.id, (channel) => {
        // Check if this channel already exists in the store
        const existingChannels = useNodeStore.getState().channels[node.id] || [];
        const exists = existingChannels.some((c) => c.id === channel.id);
        
        if (!exists) {
          console.log("[useNodeSubscriptions] New channel detected:", channel.name, "in node:", node.name);
          // Add the new channel to the store
          useNodeStore.setState((state) => ({
            channels: {
              ...state.channels,
              [node.id]: [...(state.channels[node.id] || []), channel].sort((a, b) => a.position - b.position),
            },
          }));
        }
      });

      channelSubsRef.current.set(node.id, unsub);
    }

    // Cleanup subscriptions for nodes we no longer have
    for (const [nodeId, unsub] of channelSubsRef.current) {
      if (!nodes.some((n) => n.id === nodeId)) {
        unsub();
        channelSubsRef.current.delete(nodeId);
      }
    }

    return () => {
      channelSubsRef.current.forEach((unsub) => unsub());
      channelSubsRef.current.clear();
    };
  }, [nodes]);
}
