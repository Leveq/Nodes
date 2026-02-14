import { memo, useState, useMemo } from "react";
import type { TransportMessage } from "@nodes/transport";
import type { FileAttachment } from "@nodes/core";
import { useDisplayName } from "../../hooks/useDisplayName";
import { formatMessageTime, formatFullTimestamp } from "../../utils/time";
import { NameSkeleton } from "../ui";
import { MessageAttachment } from "./MessageAttachment";
import { ImageLightbox } from "./ImageLightbox";

interface MessageItemProps {
  message: TransportMessage;
  isCompact: boolean; // true for continuation messages in a group
}

/**
 * MessageItem renders a single message.
 *
 * Full message (first in group):
 * ┌──────────────────────────────────────────┐
 * │ [Avatar]  AuthorName        2:45 PM      │
 * │           Message content here            │
 * └──────────────────────────────────────────┘
 *
 * Compact message (continuation):
 * ┌──────────────────────────────────────────┐
 * │           Another message from same user  │  ← timestamp on hover
 * └──────────────────────────────────────────┘
 */
export const MessageItem = memo(function MessageItem({
  message,
  isCompact,
}: MessageItemProps) {
  const { displayName, isLoading } = useDisplayName(message.authorKey);
  const [lightboxImage, setLightboxImage] = useState<{
    attachment: FileAttachment;
    imageUrl: string;
  } | null>(null);

  // Parse attachments from JSON string
  const attachments = useMemo((): FileAttachment[] => {
    if (!message.attachments) return [];
    try {
      const parsed = JSON.parse(message.attachments);
      console.log('[MessageItem] Parsed attachments:', parsed);
      return parsed;
    } catch {
      console.error('[MessageItem] Failed to parse attachments:', message.attachments);
      return [];
    }
  }, [message.attachments]);

  // Get first letter for avatar placeholder
  const avatarLetter = isLoading ? "" : displayName.charAt(0).toUpperCase();

  const handleImageClick = (attachment: FileAttachment, imageUrl: string) => {
    setLightboxImage({ attachment, imageUrl });
  };

  const renderAttachments = () => {
    if (attachments.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {attachments.map((attachment, index) => (
          <MessageAttachment
            key={`${attachment.cid}-${index}`}
            attachment={attachment}
            authorKey={message.authorKey}
            onImageClick={handleImageClick}
          />
        ))}
      </div>
    );
  };

  if (isCompact) {
    return (
      <>
        <div className="group flex items-start px-4 py-0.5 hover:bg-nodes-surface/50">
          {/* Timestamp on hover (hidden by default) */}
          <div className="w-10 shrink-0 text-right pr-2">
            <span
              className="text-[10px] text-nodes-text-muted opacity-0 group-hover:opacity-100 transition-opacity"
              title={formatFullTimestamp(message.timestamp)}
            >
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
          {/* Message content */}
          <div className="flex-1 min-w-0">
            {message.content && (
              <p className="text-nodes-text break-words whitespace-pre-wrap">
                {message.content}
              </p>
            )}
            {renderAttachments()}
          </div>
        </div>

        {/* Image lightbox */}
        {lightboxImage && (
          <ImageLightbox
            attachment={lightboxImage.attachment}
            imageUrl={lightboxImage.imageUrl}
            onClose={() => setLightboxImage(null)}
          />
        )}
      </>
    );
  }

  // Full message with header
  return (
    <>
      <div className="flex items-start px-4 py-2 hover:bg-nodes-surface/50">
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-nodes-primary/20 flex items-center justify-center shrink-0 mr-3 text-nodes-primary font-medium">
          {isLoading ? (
            <div className="w-4 h-4 animate-pulse rounded bg-nodes-border/50" />
          ) : (
            avatarLetter
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {/* Header: author name + timestamp */}
          <div className="flex items-baseline gap-2">
            {isLoading ? (
              <NameSkeleton width="w-20" />
            ) : (
              <span className="font-medium text-nodes-text">{displayName}</span>
            )}
            <span
              className="text-xs text-nodes-text-muted"
              title={formatFullTimestamp(message.timestamp)}
            >
              {formatMessageTime(message.timestamp)}
            </span>
          </div>

          {/* Message content */}
          {message.content && (
            <p className="text-nodes-text break-words whitespace-pre-wrap mt-0.5">
              {message.content}
            </p>
          )}

          {/* Attachments */}
          {renderAttachments()}
        </div>
      </div>

      {/* Image lightbox */}
      {lightboxImage && (
        <ImageLightbox
          attachment={lightboxImage.attachment}
          imageUrl={lightboxImage.imageUrl}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </>
  );
});
