import { memo } from "react";
import type { MessageGroup as MessageGroupType } from "../../utils/message-grouping";
import type { ReactionData } from "@nodes/transport";
import { MessageItem } from "./MessageItem";

// Type for message reactions: messageId → emoji → reactions
type MessageReactionsMap = Record<string, Record<string, ReactionData[]>>;

interface MessageGroupProps {
  group: MessageGroupType;
  reactions?: MessageReactionsMap;
  onAddReaction?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string, emoji: string) => void;
  onScrollToMessage?: (messageId: string) => void;
}

/**
 * MessageGroup renders a group of consecutive messages from the same author.
 * The first message shows the full header (avatar, name, timestamp).
 * Subsequent messages show only the content in compact mode.
 */
export const MessageGroup = memo(function MessageGroup({
  group,
  reactions,
  onAddReaction,
  onRemoveReaction,
  onScrollToMessage,
}: MessageGroupProps) {
  // Create wrapped handlers that include messageId
  const createAddReactionHandler = (messageId: string) => {
    if (!onAddReaction) return undefined;
    return (emoji: string) => onAddReaction(messageId, emoji);
  };

  const createRemoveReactionHandler = (messageId: string) => {
    if (!onRemoveReaction) return undefined;
    return (emoji: string) => onRemoveReaction(messageId, emoji);
  };

  return (
    <div className="py-1">
      {group.messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          isCompact={index > 0}
          reactions={reactions?.[message.id]}
          onAddReaction={createAddReactionHandler(message.id)}
          onRemoveReaction={createRemoveReactionHandler(message.id)}
          onScrollToMessage={onScrollToMessage}
        />
      ))}
    </div>
  );
});
