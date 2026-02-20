import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import type { TransportMessage } from "@nodes/transport";
import { useDMStore } from "../../stores/dm-store";
import { ProfileManager } from "@nodes/transport-gun";
import { groupMessages, isSystemMessage } from "../../utils/message-grouping";
import { shouldShowDateSeparator } from "../../utils/time";
import { MessageGroup } from "../channel/MessageGroup";
import { SystemMessage } from "../channel/SystemMessage";
import { DateSeparator } from "../channel/DateSeparator";
import { NewMessagesBanner } from "../channel/NewMessagesBanner";
import { DMMessageInput } from "./DMMessageInput";
import { Avatar } from "../ui";
import { setCachedAvatarCid } from "../../hooks/useDisplayName";

const profileManager = new ProfileManager();

// Stable empty array to avoid new references on each render
const EMPTY_MESSAGES: TransportMessage[] = [];

interface DMViewProps {
  conversationId: string;
  recipientKey: string;
  onUserClick?: (userId: string) => void;
}

/**
 * DMView is the main view for a direct message conversation.
 * Similar to ChannelView but uses end-to-end encrypted messaging.
 */
export function DMView({ conversationId, recipientKey, onUserClick }: DMViewProps) {
  const messages = useDMStore((s) => s.messages[conversationId] ?? EMPTY_MESSAGES);
  const isLoading = useDMStore((s) => s.isLoading);
  
  const [recipientName, setRecipientName] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showNewMessagesBanner, setShowNewMessagesBanner] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const prevMessageCountRef = useRef(messages.length);

  // Resolve recipient name
  useEffect(() => {
    async function resolveName() {
      try {
        const profile = await profileManager.getPublicProfile(recipientKey);
        setRecipientName(profile?.displayName || recipientKey.slice(0, 8));
        // Cache avatar CID for use by Avatar components
        if (profile?.avatar) {
          setCachedAvatarCid(recipientKey, profile.avatar);
        }
      } catch {
        setRecipientName(recipientKey.slice(0, 8));
      }
    }
    resolveName();
  }, [recipientKey]);

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
      if (isAtBottom) {
        scrollToBottom();
      } else {
        setShowNewMessagesBanner(true);
      }
    }

    prevMessageCountRef.current = currentCount;
  }, [messages.length, isAtBottom, scrollToBottom]);

  // Initial scroll to bottom
  useEffect(() => {
    scrollToBottom(false);
  }, [conversationId]);

  if (!conversationId) {
    return (
      <div className="flex-1 flex items-center justify-center text-nodes-text-muted">
        Select a conversation to start chatting
      </div>
    );
  }

  // Empty state
  if (messages.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col h-full">
        <DMHeader 
          recipientName={recipientName} 
          recipientKey={recipientKey} 
          onUserClick={() => onUserClick?.(recipientKey)}
        />
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <div className="mb-4">
            <Avatar
              publicKey={recipientKey}
              displayName={recipientName}
              size="xl"
            />
          </div>
          <h2 className="text-xl font-semibold text-nodes-text mb-2">
            {recipientName}
          </h2>
          <p className="text-nodes-text-muted text-sm max-w-md">
            This is the beginning of your encrypted conversation with{" "}
            <strong className="text-nodes-text">{recipientName}</strong>.
          </p>
          <p className="text-nodes-text-muted text-xs mt-2">
            Messages are end-to-end encrypted. Only you and {recipientName} can read them.
          </p>
        </div>
        <DMMessageInput
          conversationId={conversationId}
          recipientKey={recipientKey}
          recipientName={recipientName}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <DMHeader 
        recipientName={recipientName} 
        recipientKey={recipientKey} 
        onUserClick={() => onUserClick?.(recipientKey)}
      />
      
      {/* Message list */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-4"
      >
        {/* Beginning of conversation notice */}
        <div className="text-center py-8">
          <div className="mx-auto mb-3">
            <Avatar
              publicKey={recipientKey}
              displayName={recipientName}
              size="lg"
            />
          </div>
          <h3 className="text-lg font-semibold text-nodes-text mb-1">
            {recipientName}
          </h3>
          <p className="text-nodes-text-muted text-xs">
            🔒 Messages are end-to-end encrypted
          </p>
        </div>

        {/* Messages */}
        {messageGroups.map((group, groupIndex) => {
          const prevGroup = messageGroups[groupIndex - 1];
          const showDate =
            !prevGroup ||
            shouldShowDateSeparator(
              prevGroup.messages[prevGroup.messages.length - 1].timestamp,
              group.messages[0].timestamp
            );

          if (isSystemMessage(group.messages[0])) {
            return (
              <div key={group.messages[0].id}>
                {showDate && (
                  <DateSeparator timestamp={group.messages[0].timestamp} />
                )}
                <SystemMessage message={group.messages[0]} />
              </div>
            );
          }

          return (
            <div key={group.messages[0].id}>
              {showDate && (
                <DateSeparator timestamp={group.messages[0].timestamp} />
              )}
              <MessageGroup group={group} />
            </div>
          );
        })}
      </div>

      {/* New messages banner */}
      {showNewMessagesBanner && (
        <NewMessagesBanner onClick={scrollToBottom} />
      )}

      {/* Input */}
      <DMMessageInput
        conversationId={conversationId}
        recipientKey={recipientKey}
        recipientName={recipientName}
      />
    </div>
  );
}

interface DMHeaderProps {
  recipientName: string;
  recipientKey: string;
  onUserClick?: () => void;
}

function DMHeader({ recipientName, recipientKey, onUserClick }: DMHeaderProps) {
  return (
    <div className="h-12 px-4 flex items-center gap-3 border-b border-nodes-border shrink-0">
      <button
        onClick={onUserClick}
        className="hover:ring-2 hover:ring-nodes-primary/50 rounded-full transition-all"
        title="View Profile"
      >
        <Avatar
          publicKey={recipientKey}
          displayName={recipientName}
          size="sm"
        />
      </button>
      <div>
        <button 
          onClick={onUserClick}
          className="font-semibold text-nodes-text hover:underline"
        >
          {recipientName}
        </button>
      </div>
      <div className="ml-auto flex items-center gap-1 text-nodes-text-muted text-xs">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
        </svg>
        <span>Encrypted</span>
      </div>
    </div>
  );
}
