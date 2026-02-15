import { X, Reply } from "lucide-react";

interface ReplyPreviewProps {
  authorName: string;
  contentPreview: string;
  onCancel: () => void;
}

/**
 * ReplyPreview shows above the message input when replying to a message.
 *
 * ┌──────────────────────────────────────────┐
 * │ ↩ Replying to AuthorName             [X] │
 * │   Message preview text here...           │
 * └──────────────────────────────────────────┘
 */
export function ReplyPreview({
  authorName,
  contentPreview,
  onCancel,
}: ReplyPreviewProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-nodes-surface border-t border-nodes-border">
      <Reply className="w-4 h-4 text-nodes-accent shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-xs text-nodes-accent font-medium">
          Replying to {authorName}
        </div>
        <div className="text-sm text-nodes-text-muted truncate">
          {contentPreview}
        </div>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="p-1 rounded hover:bg-nodes-border/50 text-nodes-text-muted hover:text-nodes-text transition-colors"
        title="Cancel reply"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
