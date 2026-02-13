import { useEffect } from "react";
import type { TransportMessage } from "@nodes/transport";
import { useTransport } from "../../providers/TransportProvider";
import { useMessageStore } from "../../stores/message-store";
import { useIdentityStore } from "../../stores/identity-store";
import { createMessageBatcher } from "../../utils/message-batcher";
import { MessageList } from "./MessageList";
import { MessageInput } from "./MessageInput";
import { TypingIndicator } from "./TypingIndicator";

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
    transport.message
      .getHistory(channelId, { limit: 50 })
      .then((history: TransportMessage[]) => {
        setMessages(channelId, history);
        setLoading(channelId, false);
      })
      .catch((err: Error) => {
        console.error("Failed to load message history:", err);
        setLoading(channelId, false);
      });

    // Subscribe to new messages (batched to avoid flooding React)
    const messageUnsub = transport.message.subscribe(channelId, (message: TransportMessage) => {
      batcher.add(channelId, message);
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
          setTimeout(() => {
            removeTypingUser(channelId, typingPublicKey);
          }, 5000);
        } else {
          removeTypingUser(channelId, typingPublicKey);
        }
      }
    );
    setTypingSubscription(typingUnsub);

    // Clear unread count for this channel
    clearUnread(channelId);

    // Cleanup on unmount or channel change
    return () => {
      batcher.cancel();
      messageUnsub();
      typingUnsub();
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
    <div className="flex flex-col h-full">
      <MessageList
        channelId={channelId}
        channelName={channelName}
        channelTopic={channelTopic}
      />
      <TypingIndicator channelId={channelId} />
      <MessageInput channelId={channelId} channelName={channelName} />
    </div>
  );
}
