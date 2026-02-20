import { memo, useState, useMemo, useCallback } from "react";
import type { TransportMessage, ReactionData } from "@nodes/transport";
import type { FileAttachment } from "@nodes/core";
import { mentionsUser } from "@nodes/core";
import { useDisplayName } from "../../hooks/useDisplayName";
import { useLinkPreview } from "../../hooks/useLinkPreview";
import { usePermissions, useMemberRoleColor } from "../../hooks/usePermissions";
import { useIdentityStore } from "../../stores/identity-store";
import { formatMessageTime, formatFullTimestamp } from "../../utils/time";
import { getFirstPreviewableUrl } from "../../utils/url-detection";
import { NameSkeleton, Avatar } from "../ui";
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
import { isGiphyUrl } from "../../services/giphy-service";

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
  const avatarVersion = useIdentityStore((s) => s.avatarVersion);
  const myProfile = useIdentityStore((s) => s.profile);
  const addToast = useToastStore((s) => s.addToast);
  
  // Permission checks
  const { canDeleteAnyMessage, permissions } = usePermissions(message.channelId);
  const canReact = permissions?.useReactions ?? true;
  
  // Author's role color
  const authorRoleColor = useMemberRoleColor(message.authorKey);

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
  
  // Check if this message mentions the current user (or @everyone/@here)
  const isMentioned = useMemo(() => {
    if (!publicKey || !message.content || message.deleted) return false;
    // Check for direct user mention
    if (mentionsUser(message.content, publicKey)) return true;
    // Check for @everyone or @here
    return message.content.includes('<@everyone>') || message.content.includes('<@here>');
  }, [publicKey, message.content, message.deleted]);
  
  // Check if message is purely a Giphy URL (for inline rendering)
  const giphyUrl = useMemo(() => {
    if (!message.content || message.deleted) return null;
    const trimmed = message.content.trim();
    // Only treat as GIF if the entire message is just the URL
    if (isGiphyUrl(trimmed)) return trimmed;
    return null;
  }, [message.content, message.deleted]);
  
  // Can delete if own message or has deleteAnyMessage permission
  const canDelete = isOwnMessage || canDeleteAnyMessage;

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
    if (!transport || !canDelete) return;
    try {
      await transport.message.deleteMessage(message.channelId, message.id);
      addToast("success", "Message deleted");
    } catch (err) {
      console.error("Failed to delete message:", err);
      addToast("error", "Failed to delete message");
    }
  }, [transport, canDelete, message.channelId, message.id, addToast]);

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
          } ${isMentioned ? "bg-accent-primary/10 border-l-2 border-accent-primary" : ""}`}
        >
          {/* Context menu */}
          {!isDeleted && (
            <MessageContextMenu
              messageId={message.id}
              isOwnMessage={isOwnMessage}
              canDelete={canDelete}
              canReact={canReact}
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
                    {giphyUrl ? (
                      <img
                        src={giphyUrl}
                        alt="GIF"
                        className="rounded-md max-w-[300px] max-h-[200px] object-contain"
                        loading="lazy"
                      />
                    ) : message.content && (
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
                    canAddReaction={canReact}
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
        } ${isMentioned ? "bg-accent-primary/10 border-l-2 border-accent-primary" : ""}`}
      >
        {/* Context menu */}
        {!isDeleted && (
          <MessageContextMenu
            messageId={message.id}
            isOwnMessage={isOwnMessage}
            canDelete={canDelete}
            canReact={canReact}
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
        <div className="shrink-0 mr-3">
          <Avatar
            publicKey={message.authorKey}
            displayName={displayName}
            size="md"
            avatarVersion={isOwnMessage ? avatarVersion : 0}
            avatarCid={isOwnMessage ? myProfile?.data.avatar : undefined}
          />
        </div>

        {/* Content area */}
        <div className="flex-1 min-w-0">
          {/* Header: author name + timestamp */}
          <div className="flex items-baseline gap-2">
            {isLoading ? (
              <NameSkeleton width="w-20" />
            ) : (
              <span 
                className="font-medium"
                style={{ color: authorRoleColor || 'var(--nodes-text)' }}
              >
                {displayName}
              </span>
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
                  {giphyUrl ? (
                    <div className="mt-0.5">
                      <img
                        src={giphyUrl}
                        alt="GIF"
                        className="rounded-md max-w-[300px] max-h-[200px] object-contain"
                        loading="lazy"
                      />
                    </div>
                  ) : message.content && (
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
                  canAddReaction={canReact}
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
