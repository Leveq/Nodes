import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import type { TransportMessage, ReactionData } from "@nodes/transport";
import { useMessageStore } from "../../stores/message-store";
import { groupMessages, isSystemMessage } from "../../utils/message-grouping";
import { shouldShowDateSeparator } from "../../utils/time";
import { MessageGroup } from "./MessageGroup";
import { SystemMessage } from "./SystemMessage";
import { DateSeparator } from "./DateSeparator";
import { NewMessagesBanner } from "./NewMessagesBanner";

// Stable empty array to avoid new references on each render
const EMPTY_MESSAGES: TransportMessage[] = [];

// Type for message reactions: messageId → emoji → reactions
type MessageReactionsMap = Record<string, Record<string, ReactionData[]>>;

interface MessageListProps {
  channelId: string;
  channelName: string;
  channelTopic?: string;
  reactions?: MessageReactionsMap;
  onAddReaction?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string, emoji: string) => void;
}

/**
 * MessageList renders all messages for the active channel with proper
 * grouping, timestamps, and auto-scroll behavior.
 *
 * Auto-scroll rules:
 * - On new message: scroll to bottom IF already at bottom (within 100px)
 * - If user has scrolled up: do NOT auto-scroll, show "New messages ↓" button
 * - Clicking "New messages ↓" scrolls to bottom and dismisses the indicator
 * - On initial load: always scroll to bottom
 */
export function MessageList({
  channelId,
  channelName,
  channelTopic,
  reactions,
  onAddReaction,
  onRemoveReaction,
}: MessageListProps) {
  const messages = useMessageStore((s) => s.messages[channelId] ?? EMPTY_MESSAGES);
  const isLoading = useMessageStore((s) => s.loadingChannels[channelId] ?? false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showNewMessagesBanner, setShowNewMessagesBanner] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const prevMessageCountRef = useRef(messages.length);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  // Group messages by author
  const messageGroups = useMemo(() => groupMessages(messages), [messages]);

  // Check if we're at the bottom of the scroll container
  const checkIsAtBottom = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return true;
    const threshold = 100;
    return (
      container.scrollHeight - container.scrollTop - container.clientHeight <
      threshold
    );
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    const container = scrollRef.current;
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
    setShowNewMessagesBanner(false);
    setIsAtBottom(true);
  }, []);

  // Scroll to a specific message by ID
  const scrollToMessage = useCallback((messageId: string) => {
    const container = scrollRef.current;
    if (!container) return;

    // Find the message element
    const messageEl = container.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
      messageEl.scrollIntoView({ behavior: "smooth", block: "center" });
      // Highlight briefly
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2000);
    }
  }, []);

  // Listen for scroll-to-message events from search
  useEffect(() => {
    const handleScrollToMessage = (event: CustomEvent<{ messageId: string; channelId: string; highlight?: boolean }>) => {
      const { messageId, channelId: targetChannelId, highlight } = event.detail;
      
      // Only handle if this is the target channel
      if (targetChannelId !== channelId) return;
      
      // Wait a bit for the channel view to render if we just navigated
      setTimeout(() => {
        const container = scrollRef.current;
        if (!container) return;
        
        const messageEl = container.querySelector(`[data-message-id="${messageId}"]`);
        if (messageEl) {
          messageEl.scrollIntoView({ behavior: "smooth", block: "center" });
          if (highlight) {
            setHighlightedMessageId(messageId);
            setTimeout(() => setHighlightedMessageId(null), 2000);
          }
        }
      }, 100);
    };

    window.addEventListener("scroll-to-message", handleScrollToMessage as EventListener);
    return () => {
      window.removeEventListener("scroll-to-message", handleScrollToMessage as EventListener);
    };
  }, [channelId]);

  // Handle scroll events
  const handleScroll = useCallback(() => {
    const atBottom = checkIsAtBottom();
    setIsAtBottom(atBottom);
    if (atBottom) {
      setShowNewMessagesBanner(false);
    }
  }, [checkIsAtBottom]);

  // Auto-scroll on new messages
  useEffect(() => {
    const prevCount = prevMessageCountRef.current;
    const currentCount = messages.length;

    if (currentCount > prevCount) {
      // New messages arrived
      if (isAtBottom) {
        scrollToBottom();
      } else {
        // User is scrolled up, show banner
        setShowNewMessagesBanner(true);
      }
    }

    prevMessageCountRef.current = currentCount;
  }, [messages.length, isAtBottom, scrollToBottom]);

  // Initial scroll to bottom
  useEffect(() => {
    scrollToBottom(false);
  }, [channelId]); // Scroll when channel changes

  // Loading state
  if (isLoading && messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-nodes-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Empty state
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
        <div className="w-20 h-20 rounded-full bg-nodes-surface flex items-center justify-center mb-4">
          <span className="text-4xl text-nodes-text-muted">#</span>
        </div>
        <h2 className="text-2xl font-bold text-nodes-text mb-2">
          Welcome to #{channelName}
        </h2>
        {channelTopic && (
          <p className="text-nodes-text-muted mb-4 max-w-md">{channelTopic}</p>
        )}
        <p className="text-sm text-nodes-text-muted">
          This is the beginning of the #{channelName} channel.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 relative overflow-hidden">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="absolute inset-0 overflow-y-auto"
      >
        <div className="py-4">
          {messageGroups.map((group, groupIndex) => {
            // Check if we need a date separator before this group
            const prevGroup = messageGroups[groupIndex - 1];
            const prevTimestamp = prevGroup
              ? prevGroup.messages[prevGroup.messages.length - 1].timestamp
              : null;
            const showSeparator = shouldShowDateSeparator(
              group.timestamp,
              prevTimestamp
            );

            // Check if this is a system message group
            const firstMessage = group.messages[0];
            const isSystem = isSystemMessage(firstMessage);

            return (
              <div key={`group-${group.timestamp}-${group.authorKey}`}>
                {showSeparator && (
                  <DateSeparator timestamp={group.timestamp} />
                )}
                {isSystem ? (
                  // Render each system message individually
                  group.messages.map((msg) => (
                    <SystemMessage key={msg.id} message={msg} />
                  ))
                ) : (
                  <MessageGroup
                    group={group}
                    reactions={reactions}
                    onAddReaction={onAddReaction}
                    onRemoveReaction={onRemoveReaction}
                    onScrollToMessage={scrollToMessage}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* New messages banner */}
      {showNewMessagesBanner && (
        <NewMessagesBanner onClick={() => scrollToBottom()} />
      )}
    </div>
  );
}
