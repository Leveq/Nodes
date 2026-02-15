import { Reply } from "lucide-react";
import { useDisplayName } from "../../hooks/useDisplayName";

interface QuotedMessageProps {
  replyTo: {
    messageId: string;
    authorKey: string;
    contentPreview: string;
  };
  onScrollToMessage?: (messageId: string) => void;
}

/**
 * QuotedMessage shows the referenced message above a reply.
 *
 * ┌──────────────────────────────────────────┐
 * │ │ AuthorName: Original message preview...│
 * └──────────────────────────────────────────┘
 *
 * Clicking scrolls to the original message.
 */
export function QuotedMessage({
  replyTo,
  onScrollToMessage,
}: QuotedMessageProps) {
  const { displayName, isLoading } = useDisplayName(replyTo.authorKey);

  const handleClick = () => {
    if (onScrollToMessage) {
      onScrollToMessage(replyTo.messageId);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex items-start gap-2 mb-1 text-left w-full hover:bg-nodes-surface/50 rounded px-2 py-1 -ml-2 transition-colors group"
      title="Click to scroll to original message"
    >
      {/* Left border indicator */}
      <div className="w-1 self-stretch bg-nodes-accent/30 rounded-full shrink-0" />
      
      {/* Reply icon */}
      <Reply className="w-3 h-3 text-nodes-text-muted mt-0.5 shrink-0" />
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium text-nodes-accent group-hover:underline">
          {isLoading ? "..." : displayName}
        </span>
        <span className="text-xs text-nodes-text-muted ml-1 truncate inline-block max-w-[300px]">
          {replyTo.contentPreview}
        </span>
      </div>
    </button>
  );
}
