import { useEffect, useState, useCallback, useRef } from "react";
import type { TransportMessage, ReactionData } from "@nodes/transport";
import { useTransport } from "../../providers/TransportProvider";
import { useMessageStore } from "../../stores/message-store";
import { useIdentityStore } from "../../stores/identity-store";
import { useReactionStore } from "../../stores/reaction-store";
import { useNodeStore } from "../../stores/node-store";
import { createMessageBatcher } from "../../utils/message-batcher";
import { getSearchIndex } from "../../services/search-index";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { TypingIndicator } from "./TypingIndicator";
import { DropZone } from "./DropZone";
import type { PendingAttachment } from "./FileAttachmentButton";

// Stable empty object to avoid new references on each render
const EMPTY_REACTIONS: Record<string, Record<string, ReactionData[]>> = {};

interface ChannelViewProps {
  channelId: string;
  channelName: string;
  channelTopic?: string;
}

/**
 * ChannelView orchestrates the message experience for a channel:
 * 1. Subscribes to real-time messages when the channel becomes active
 * 2. Loads message history on mount
 * 3. Subscribes to typing indicators
 * 4. Cleans up subscriptions when switching channels
 * 5. Renders MessageList + TypingIndicator + MessageInput
 */
export function ChannelView({
  channelId,
  channelName,
  channelTopic,
}: ChannelViewProps) {
  const transport = useTransport();
  const publicKey = useIdentityStore((s) => s.publicKey);
  const typingTimeoutsRef = useRef<Map<string, number>>(new Map());

  const [droppedAttachments, setDroppedAttachments] = useState<PendingAttachment[]>([]);
  
  // Reactions state - use stable empty object to prevent infinite re-renders
  const channelReactions = useReactionStore((s) => s.reactions[channelId]);
  const reactions = channelReactions ?? EMPTY_REACTIONS;
  const setReactionsForMessage = useReactionStore((s) => s.setReactionsForMessage);

  // Handle files dropped via drag-and-drop
  const handleFilesDropped = useCallback((files: PendingAttachment[]) => {
    setDroppedAttachments(files);
    // Clear after passing to input (input will pick them up via effect)
    setTimeout(() => setDroppedAttachments([]), 100);
  }, []);

  // Handle adding a reaction (optimistic update + Gun write)
  const handleAddReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!transport) return;
    
    // Get current user's public key for optimistic update
    const currentUserKey = useIdentityStore.getState().publicKey;
    if (!currentUserKey) return;
    
    // Optimistic update - immediately show the reaction
    const currentReactions = useReactionStore.getState().reactions[channelId]?.[messageId] || {};
    const emojiReactions = currentReactions[emoji] || [];
    const alreadyReacted = emojiReactions.some(r => r.userKey === currentUserKey);
    
    if (!alreadyReacted) {
      const updatedReactions = {
        ...currentReactions,
        [emoji]: [
          ...emojiReactions,
          { emoji, userKey: currentUserKey, timestamp: Date.now() }
        ]
      };
      setReactionsForMessage(channelId, messageId, updatedReactions);
    }
    
    try {
      await transport.message.addReaction(channelId, messageId, emoji);
    } catch (err) {
      console.error("Failed to add reaction:", err);
      // Revert optimistic update on error
      setReactionsForMessage(channelId, messageId, currentReactions);
    }
  }, [transport, channelId, setReactionsForMessage]);

  // Handle removing a reaction (optimistic update + Gun write)
  const handleRemoveReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!transport) return;
    
    // Get current user's public key for optimistic update
    const currentUserKey = useIdentityStore.getState().publicKey;
    if (!currentUserKey) return;
    
    // Optimistic update - immediately remove the reaction
    const currentReactions = useReactionStore.getState().reactions[channelId]?.[messageId] || {};
    const emojiReactions = currentReactions[emoji] || [];
    const updatedEmojiReactions = emojiReactions.filter(r => r.userKey !== currentUserKey);
    
    const updatedReactions = { ...currentReactions };
    if (updatedEmojiReactions.length > 0) {
      updatedReactions[emoji] = updatedEmojiReactions;
    } else {
      delete updatedReactions[emoji];
    }
    setReactionsForMessage(channelId, messageId, updatedReactions);
    
    try {
      await transport.message.removeReaction(channelId, messageId, emoji);
    } catch (err) {
      console.error("Failed to remove reaction:", err);
      // Revert optimistic update on error
      setReactionsForMessage(channelId, messageId, currentReactions);
    }
  }, [transport, channelId, setReactionsForMessage]);

  // Set up subscriptions when channel changes
  useEffect(() => {
    if (!transport || !channelId) return;

    // Get store actions (stable references)
    const {
      setMessages,
      addMessage,
      setSubscription,
      setTypingSubscription,
      addTypingUser,
      removeTypingUser,
      clearUnread,
      clearChannel,
      setLoading,
      messages: existingMessages,
    } = useMessageStore.getState();

    // Create batcher to prevent Gun's rapid updates from flooding React
    const batcher = createMessageBatcher(addMessage);

    // Clean up previous subscriptions
    clearChannel(channelId);

    // Only show loading spinner if we don't have cached messages
    const hasCachedMessages = (existingMessages[channelId]?.length ?? 0) > 0;
    if (!hasCachedMessages) {
      setLoading(channelId, true);
    }

    // Load message history
    const nodeId = useNodeStore.getState().activeNodeId;
    const searchIndex = getSearchIndex();
    
    transport.message
      .getHistory(channelId, { limit: 50 })
      .then((history: TransportMessage[]) => {
        setMessages(channelId, history);
        setLoading(channelId, false);
        
        // Index all history messages for search
        if (nodeId) {
          for (const msg of history) {
            if (msg.type !== "system") {
              searchIndex.addMessage(
                {
                  id: msg.id,
                  content: msg.content,
                  timestamp: msg.timestamp,
                  authorKey: msg.authorKey,
                  channelId: channelId,
                  type: msg.type as "text" | "system" | "file",
                },
                nodeId
              );
            }
          }
        }
      })
      .catch((err: Error) => {
        console.error("Failed to load message history:", err);
        setLoading(channelId, false);
      });

    // Subscribe to new messages (batched to avoid flooding React)
    const messageUnsub = transport.message.subscribe(channelId, (message: TransportMessage) => {
      batcher.add(channelId, message);
      
      // Index message for search
      if (nodeId && message.type !== "system") {
        searchIndex.addMessage(
          {
            id: message.id,
            content: message.content,
            timestamp: message.timestamp,
            authorKey: message.authorKey,
            channelId: channelId,
            type: message.type as "text" | "system" | "file",
          },
          nodeId
        );
      }
    });
    setSubscription(messageUnsub);

    // Subscribe to typing indicators
    const typingUnsub = transport.presence.subscribeTyping(
      channelId,
      (typingPublicKey, isTyping) => {
        // Don't show our own typing indicator
        if (typingPublicKey === publicKey) return;

        if (isTyping) {
          addTypingUser(channelId, typingPublicKey);

          // Auto-remove after 5 seconds (in case we miss the "stopped typing" event)
          // Clear any existing timeout for this user before setting a new one
          const existingTimeout = typingTimeoutsRef.current.get(typingPublicKey);
          if (existingTimeout !== undefined) {
            clearTimeout(existingTimeout);
          }
          const tid = window.setTimeout(() => {
            removeTypingUser(channelId, typingPublicKey);
            typingTimeoutsRef.current.delete(typingPublicKey);
          }, 5000);
          typingTimeoutsRef.current.set(typingPublicKey, tid);
        } else {
          removeTypingUser(channelId, typingPublicKey);
        }
      }
    );
    setTypingSubscription(typingUnsub);

    // Subscribe to reactions
    const { setReactionsForMessage: setReactions } = useReactionStore.getState();
    
    const reactionUnsub = transport.message.subscribeReactions(
      channelId,
      (messageId: string, reactions: Record<string, ReactionData[]>) => {
        setReactions(channelId, messageId, reactions);
      }
    );

    // Clear unread count for this channel
    clearUnread(channelId);

    // Cleanup on unmount or channel change
    return () => {
      batcher.cancel();
      messageUnsub();
      typingUnsub();
      reactionUnsub();
      // Clear all pending typing-indicator auto-remove timeouts
      typingTimeoutsRef.current.forEach((tid) => clearTimeout(tid));
      typingTimeoutsRef.current.clear();
    };
  }, [channelId, transport, publicKey]);

  if (!channelId) {
    return (
      <div className="flex-1 flex items-center justify-center text-nodes-text-muted">
        Select a channel to start chatting
      </div>
    );
  }

  return (
    <DropZone onFilesDropped={handleFilesDropped}>
      <div className="flex flex-col h-full">
        <MessageList
          channelId={channelId}
          channelName={channelName}
          channelTopic={channelTopic}
          reactions={reactions}
          onAddReaction={handleAddReaction}
          onRemoveReaction={handleRemoveReaction}
        />
        <TypingIndicator channelId={channelId} />
        <MessageInput
          channelId={channelId}
          channelName={channelName}
          externalAttachments={droppedAttachments}
        />
      </div>
    </DropZone>
  );
}
