import { memo } from "react";
import type { MessageGroup as MessageGroupType } from "../../utils/message-grouping";
import { MessageItem } from "./MessageItem";

interface MessageGroupProps {
  group: MessageGroupType;
}

/**
 * MessageGroup renders a group of consecutive messages from the same author.
 * The first message shows the full header (avatar, name, timestamp).
 * Subsequent messages show only the content in compact mode.
 */
export const MessageGroup = memo(function MessageGroup({
  group,
}: MessageGroupProps) {
  return (
    <div className="py-1">
      {group.messages.map((message, index) => (
        <MessageItem
          key={message.id}
          message={message}
          isCompact={index > 0}
        />
      ))}
    </div>
  );
});
