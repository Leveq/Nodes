import { memo, useState, useMemo, useCallback } from "react";
import type { TransportMessage, ReactionData } from "@nodes/transport";
import type { FileAttachment } from "@nodes/core";
import { useDisplayName } from "../../hooks/useDisplayName";
import { useLinkPreview } from "../../hooks/useLinkPreview";
import { useIdentityStore } from "../../stores/identity-store";
import { formatMessageTime, formatFullTimestamp } from "../../utils/time";
import { getFirstPreviewableUrl } from "../../utils/url-detection";
import { NameSkeleton } from "../ui";
import { MessageAttachment } from "./MessageAttachment";
import { ImageLightbox } from "./ImageLightbox";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { ReactionBar } from "./ReactionBar";
import { QuotedMessage } from "./QuotedMessage";
import { MessageEditor } from "./MessageEditor";
import { MessageContextMenu } from "./MessageContextMenu";
import { EmojiPicker } from "./EmojiPicker";
import { LinkPreviewCard, LinkPreviewSkeleton } from "./LinkPreviewCard";
import { useEditStore } from "../../stores/edit-store";
import { useReplyStore } from "../../stores/reply-store";
import { useTransport } from "../../providers/TransportProvider";
import { useToastStore } from "../../stores/toast-store";

// Type for emoji → reactions array mapping
type ReactionMap = Record<string, ReactionData[]>;

interface MessageItemProps {
  message: TransportMessage;
  isCompact: boolean; // true for continuation messages in a group
  reactions?: ReactionMap;
  onAddReaction?: (emoji: string) => void;
  onRemoveReaction?: (emoji: string) => void;
  onScrollToMessage?: (messageId: string) => void;
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
  reactions,
  onAddReaction,
  onRemoveReaction,
  onScrollToMessage,
}: MessageItemProps) {
  const { displayName, isLoading } = useDisplayName(message.authorKey);
  const [lightboxImage, setLightboxImage] = useState<{
    attachment: FileAttachment;
    imageUrl: string;
  } | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [previewDismissed, setPreviewDismissed] = useState(false);
  const transport = useTransport();
  const publicKey = useIdentityStore((s) => s.publicKey);
  const addToast = useToastStore((s) => s.addToast);

  // Link preview - extract first non-image URL from message content
  const previewUrl = useMemo(() => {
    if (message.deleted || !message.content) return null;
    return getFirstPreviewableUrl(message.content);
  }, [message.content, message.deleted]);
  
  const { preview: linkPreview, loading: previewLoading } = useLinkPreview(previewUrl ?? undefined);

  // Edit state
  const isEditing = useEditStore((s) => s.editingMessages[message.id] ?? false);
  const startEditing = useEditStore((s) => s.startEditing);
  const stopEditing = useEditStore((s) => s.stopEditing);
  
  // Reply state
  const setReplyTarget = useReplyStore((s) => s.setReplyTarget);

  // Check if current user owns this message
  const isOwnMessage = publicKey === message.authorKey;

  // Handle save edit
  const handleSaveEdit = async (newContent: string) => {
    if (!transport) return;
    try {
      await transport.message.editMessage(message.channelId, message.id, newContent);
      stopEditing(message.id);
    } catch (err) {
      console.error("Failed to edit message:", err);
      throw err;
    }
  };

  // Handle context menu actions
  const handleReply = useCallback(() => {
    setReplyTarget(message.channelId, {
      messageId: message.id,
      authorKey: message.authorKey,
      contentPreview: message.content.slice(0, 100),
    });
  }, [message, setReplyTarget]);

  const handleEdit = useCallback(() => {
    if (isOwnMessage && !isEditing) {
      startEditing(message.id, message.content);
    }
  }, [isOwnMessage, isEditing, message.id, message.content, startEditing]);

  const handleDelete = useCallback(async () => {
    if (!transport || !isOwnMessage) return;
    try {
      await transport.message.deleteMessage(message.channelId, message.id);
      addToast("success", "Message deleted");
    } catch (err) {
      console.error("Failed to delete message:", err);
      addToast("error", "Failed to delete message");
    }
  }, [transport, isOwnMessage, message.channelId, message.id, addToast]);

  const handleCopyText = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    addToast("success", "Copied to clipboard");
  }, [message.content, addToast]);

  const handleCopyLink = useCallback(() => {
    // Generate a shareable link (could include channel + message ID)
    const link = `${window.location.origin}/channel/${message.channelId}?message=${message.id}`;
    navigator.clipboard.writeText(link);
    addToast("success", "Link copied to clipboard");
  }, [message.channelId, message.id, addToast]);

  const handleOpenReactionPicker = useCallback(() => {
    setShowEmojiPicker(true);
  }, []);

  const handleEmojiSelect = useCallback((emoji: string) => {
    if (onAddReaction) {
      onAddReaction(emoji);
    }
    setShowEmojiPicker(false);
  }, [onAddReaction]);

  const handleEmojiPickerClose = useCallback(() => {
    setShowEmojiPicker(false);
  }, []);

  // Parse attachments from JSON string
  const attachments = useMemo((): FileAttachment[] => {
    if (!message.attachments) return [];
    try {
      const parsed = JSON.parse(message.attachments);
      return parsed;
    } catch {
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

  // Check if message is deleted
  const isDeleted = message.deleted || message.content === "[deleted]";

  if (isCompact) {
    return (
      <>
        <div
          data-message-id={message.id}
          className={`group relative flex items-start px-4 py-0.5 hover:bg-nodes-surface/50 ${
            isDeleted ? "opacity-60" : ""
          }`}
        >
          {/* Context menu */}
          {!isDeleted && (
            <MessageContextMenu
              messageId={message.id}
              isOwnMessage={isOwnMessage}
              isDeleted={isDeleted}
              onReply={handleReply}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onCopyText={handleCopyText}
              onCopyLink={handleCopyLink}
              onAddReaction={handleOpenReactionPicker}
            />
          )}

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
            {isDeleted ? (
              <span className="text-nodes-text-muted italic text-sm">
                This message was deleted
              </span>
            ) : (
              <>
                {/* Reply reference */}
                {message.replyTo && (
                  <QuotedMessage
                    replyTo={message.replyTo}
                    onScrollToMessage={onScrollToMessage}
                  />
                )}
                
                {/* Editable content or display */}
                {isEditing ? (
                  <MessageEditor
                    initialContent={message.content}
                    onSave={handleSaveEdit}
                    onCancel={() => stopEditing(message.id)}
                  />
                ) : (
                  <>
                    {message.content && (
                      <MarkdownRenderer content={message.content} />
                    )}
                    
                    {/* Edited indicator */}
                    {message.editedAt && (
                      <span
                        className="text-[10px] text-nodes-text-muted ml-1"
                        title={`Edited ${formatFullTimestamp(message.editedAt)}`}
                      >
                        (edited)
                      </span>
                    )}
                  </>
                )}
                
                {renderAttachments()}
                
                {/* Link Preview */}
                {!previewDismissed && previewUrl && (
                  previewLoading ? (
                    <LinkPreviewSkeleton />
                  ) : linkPreview ? (
                    <LinkPreviewCard
                      preview={linkPreview}
                      onDismiss={() => setPreviewDismissed(true)}
                    />
                  ) : null
                )}
                
                {/* Reactions */}
                {reactions && onAddReaction && onRemoveReaction && (
                  <ReactionBar
                    reactions={reactions}
                    onAddReaction={onAddReaction}
                    onRemoveReaction={onRemoveReaction}
                  />
                )}
              </>
            )}
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

        {/* Emoji picker - positioned relative to message */}
        {showEmojiPicker && (
          <>
            <div 
              className="fixed inset-0 z-50 bg-black/50" 
              onClick={handleEmojiPickerClose}
            />
            <div 
              className="fixed z-50" 
              style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
              onClick={(e) => e.stopPropagation()}
            >
              <EmojiPicker
                onSelect={handleEmojiSelect}
                onClose={handleEmojiPickerClose}
              />
            </div>
          </>
        )}
      </>
    );
  }

  // Full message with header
  return (
    <>
      <div
        data-message-id={message.id}
        className={`group relative flex items-start px-4 py-2 hover:bg-nodes-surface/50 ${
          isDeleted ? "opacity-60" : ""
        }`}
      >
        {/* Context menu */}
        {!isDeleted && (
          <MessageContextMenu
            messageId={message.id}
            isOwnMessage={isOwnMessage}
            isDeleted={isDeleted}
            onReply={handleReply}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onCopyText={handleCopyText}
            onCopyLink={handleCopyLink}
            onAddReaction={handleOpenReactionPicker}
          />
        )}

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

          {isDeleted ? (
            <div className="mt-0.5 text-nodes-text-muted italic text-sm">
              This message was deleted
            </div>
          ) : (
            <>
              {/* Reply reference */}
              {message.replyTo && (
                <QuotedMessage
                  replyTo={message.replyTo}
                  onScrollToMessage={onScrollToMessage}
                />
              )}

              {/* Message content */}
              {isEditing ? (
                <div className="mt-0.5">
                  <MessageEditor
                    initialContent={message.content}
                    onSave={handleSaveEdit}
                    onCancel={() => stopEditing(message.id)}
                  />
                </div>
              ) : (
                <>
                  {message.content && (
                    <div className="mt-0.5">
                      <MarkdownRenderer content={message.content} />
                      {/* Edited indicator */}
                      {message.editedAt && (
                        <span
                          className="text-[10px] text-nodes-text-muted ml-1"
                          title={`Edited ${formatFullTimestamp(message.editedAt)}`}
                        >
                          (edited)
                        </span>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Attachments */}
              {renderAttachments()}

              {/* Link Preview */}
              {!previewDismissed && previewUrl && (
                previewLoading ? (
                  <LinkPreviewSkeleton />
                ) : linkPreview ? (
                  <LinkPreviewCard
                    preview={linkPreview}
                    onDismiss={() => setPreviewDismissed(true)}
                  />
                ) : null
              )}

              {/* Reactions */}
              {reactions && onAddReaction && onRemoveReaction && (
                <ReactionBar
                  reactions={reactions}
                  onAddReaction={onAddReaction}
                  onRemoveReaction={onRemoveReaction}
                />
              )}
            </>
          )}
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

      {/* Emoji picker - centered on screen */}
      {showEmojiPicker && (
        <>
          <div 
            className="fixed inset-0 z-50 bg-black/50" 
            onClick={handleEmojiPickerClose}
          />
          <div 
            className="fixed z-50" 
            style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <EmojiPicker
              onSelect={handleEmojiSelect}
              onClose={handleEmojiPickerClose}
            />
          </div>
        </>
      )}
    </>
  );
});
