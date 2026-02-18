import { useState, useRef, useEffect, useCallback } from "react";
import { useTransport } from "../../providers/TransportProvider";
import { useIdentityStore } from "../../stores/identity-store";
import { useMessageStore } from "../../stores/message-store";
import { useToastStore } from "../../stores/toast-store";
import { useReplyStore } from "../../stores/reply-store";
import { usePermissions } from "../../hooks/usePermissions";
import { useSlowMode } from "../../hooks/useSlowMode";
import { FileAttachmentButton, type PendingAttachment } from "./FileAttachmentButton";
import { AttachmentPreview } from "./AttachmentPreview";
import { ReplyPreview } from "./ReplyPreview";
import { MentionAutocomplete } from "./MentionAutocomplete";
import type { FileAttachment } from "@nodes/core";
import { useDisplayName } from "../../hooks/useDisplayName";
import { generateMessageId } from "@nodes/transport-gun";
import { Clock } from "lucide-react";

interface MessageInputProps {
  channelId: string;
  channelName: string;
  onAddAttachments?: (attachments: PendingAttachment[]) => void;
  externalAttachments?: PendingAttachment[];
}

/**
 * MessageInput is the text input for sending messages.
 *
 * - Enter sends the message (if not empty after trimming or has attachments)
 * - Shift+Enter inserts a newline (multi-line support)
 * - Input clears after successful send
 * - Shows placeholder: "Message #channel-name"
 * - Supports file attachments via button or external drop
 *
 * Also handles typing indicator:
 * - On input change (debounced): set typing to true
 * - After 3 seconds of no input: set typing to false
 * - On send: immediately clear typing
 */
export function MessageInput({
  channelId,
  channelName,
  externalAttachments = [],
}: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  const { ipfsReady, ...transport } = useTransport();
  const transportRef = useRef(transport);
  transportRef.current = transport; // Keep ref updated
  
  const publicKey = useIdentityStore((s) => s.publicKey);
  const addToast = useToastStore((s) => s.addToast);
  
  // Permission checks
  const { canSendMessages, canSendFiles } = usePermissions(channelId);

  // Slow mode state
  const { canSend: slowModeCanSend, remainingSeconds, slowModeDelay, markSent, isExempt: slowModeExempt } = useSlowMode(channelId);

  // Reply state
  const replyTarget = useReplyStore((s) => s.replyTargets[channelId]);
  const clearReplyTarget = useReplyStore((s) => s.clearReplyTarget);
  const { displayName: replyAuthorName } = useDisplayName(replyTarget?.authorKey ?? "");

  // Auto-focus textarea when replying
  useEffect(() => {
    if (replyTarget && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [replyTarget]);

  // Merge external attachments (from drag-and-drop)
  useEffect(() => {
    if (externalAttachments.length > 0) {
      setPendingAttachments((prev) => [...prev, ...externalAttachments]);
    }
  }, [externalAttachments]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 200); // Max 8 rows (~200px)
      textarea.style.height = `${newHeight}px`;
    }
  }, [content]);

  // Clear typing indicator on unmount only
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // Clear typing on unmount (using ref to get current transport)
      const currentTransport = transportRef.current;
      if (currentTransport?.presence) {
        currentTransport.presence.setTyping(channelId, false).catch(() => {});
      }
    };
  }, [channelId]);

  const handleTyping = useCallback(() => {
    if (!transport) return;

    // Set typing to true
    transport.presence.setTyping(channelId, true).catch((err) => {
      console.error("[MessageInput] setTyping error:", err);
    });

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to clear typing after 3 seconds
    typingTimeoutRef.current = window.setTimeout(() => {
      transport.presence.setTyping(channelId, false).catch(() => {});
    }, 3000);
  }, [channelId, transport]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setContent(newValue);
    // Only send typing indicator if there's actual content
    if (newValue.trim()) {
      handleTyping();
    }
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    const hasAttachments = pendingAttachments.length > 0;

    if ((!trimmed && !hasAttachments) || !publicKey || !transport || isSending)
      return;

    // Check slow mode
    if (!slowModeCanSend) {
      addToast("warning", `Slow mode is active. Please wait ${remainingSeconds} seconds.`);
      return;
    }

    // Check if IPFS is ready for file uploads
    if (hasAttachments && !ipfsReady) {
      addToast("warning", "IPFS is still initializing. Please wait a moment and try again.");
      return;
    }

    // For text-only messages: instant send with optimistic update
    if (!hasAttachments) {
      // Mark as sent for slow mode tracking
      markSent();
      
      // Capture values before clearing
      const messageContent = trimmed;
      const currentReplyTarget = replyTarget;
      
      // Generate ID for both optimistic message and actual send
      const messageId = generateMessageId();
      const timestamp = Date.now();
      
      // Add optimistic message to store immediately
      useMessageStore.getState().addMessage(channelId, {
        id: messageId,
        content: messageContent,
        timestamp,
        authorKey: publicKey,
        channelId,
        type: "text",
        signature: "", // Will be filled by actual message
        ...(currentReplyTarget ? {
          replyTo: {
            messageId: currentReplyTarget.messageId,
            authorKey: currentReplyTarget.authorKey,
            contentPreview: currentReplyTarget.contentPreview,
          }
        } : {}),
      });
      
      // Clear input immediately for snappy UX
      setContent("");
      clearReplyTarget(channelId);
      
      // Reset textarea height and refocus
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.focus();
      }

      // Clear typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      transport.presence.setTyping(channelId, false).catch(() => {});

      // Send to Gun with the same ID (deduplication will prevent double-display)
      transport.message.send(channelId, {
        content: messageContent,
        authorKey: publicKey,
        type: "text",
        replyTo: currentReplyTarget ? {
          messageId: currentReplyTarget.messageId,
          authorKey: currentReplyTarget.authorKey,
          contentPreview: currentReplyTarget.contentPreview,
        } : undefined,
      } as any, messageId).catch(() => {
        addToast("error", "Failed to send message. Please try again.");
        // On failure, remove the optimistic message
        // Note: For now we don't remove it - message might still have been sent
      });

      return;
    }

    // For messages with attachments: need loading state for IPFS upload
    setIsSending(true);

    // Mark as sent for slow mode tracking (do it before async operations)
    markSent();

    try {
      // Upload attachments to IPFS
      const attachments: FileAttachment[] = [];

      for (const pending of pendingAttachments) {
        try {
          // Upload main file
          const cid = await (transport.file as any).uploadBytes(pending.bytes);

          // Upload thumbnail if exists
          let thumbnailCid: string | undefined;
          if (pending.thumbnail) {
            thumbnailCid = await (transport.file as any).uploadBytes(
              pending.thumbnail
            );
          }

          attachments.push({
            cid,
            thumbnailCid,
            filename: pending.file.name,
            mimeType: pending.file.type,
            size: pending.file.size,
            width: pending.width,
            height: pending.height,
          });

          // Revoke preview URL to free memory
          URL.revokeObjectURL(pending.previewUrl);
        } catch (err) {
          console.error(`Failed to upload ${pending.file.name}:`, err);
          addToast("error", `Failed to upload ${pending.file.name}`);
        }
      }

      // Send message with attachments
      await transport.message.send(channelId, {
        content: trimmed || "",
        authorKey: publicKey,
        type: "file",
        attachments: attachments.length > 0 ? JSON.stringify(attachments) : undefined,
        replyTo: replyTarget ? {
          messageId: replyTarget.messageId,
          authorKey: replyTarget.authorKey,
          contentPreview: replyTarget.contentPreview,
        } : undefined,
      } as any);

      // Clear input, attachments, and reply target
      setContent("");
      setPendingAttachments([]);
      clearReplyTarget(channelId);

      // Clear typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      transport.presence.setTyping(channelId, false).catch(() => {});

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch {
      addToast("error", "Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
      // Focus textarea after React re-render completes
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasContent = content.trim().length > 0 || pendingAttachments.length > 0;

  const handleFilesSelected = useCallback((files: PendingAttachment[]) => {
    setPendingAttachments((prev) => [...prev, ...files]);
  }, []);

  const handleRemoveAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => {
      const removed = prev.find((a) => a.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  // Cleanup preview URLs on unmount
  useEffect(() => {
    return () => {
      pendingAttachments.forEach((a) => URL.revokeObjectURL(a.previewUrl));
    };
  }, []);

  // Handle mention autocomplete selection
  const handleMentionSelect = useCallback((newContent: string) => {
    setContent(newContent);
    handleTyping();
  }, [handleTyping]);

  return (
    <div className="border-t border-surface-border bg-depth-primary">
      {/* Mention autocomplete popup */}
      <MentionAutocomplete
        inputRef={textareaRef}
        onMentionSelect={handleMentionSelect}
        isEnabled={canSendMessages}
      />

      {/* Reply preview */}
      {replyTarget && (
        <ReplyPreview
          authorName={replyAuthorName}
          contentPreview={replyTarget.contentPreview}
          onCancel={() => clearReplyTarget(channelId)}
        />
      )}

      {/* Attachment preview */}
      <AttachmentPreview
        attachments={pendingAttachments}
        onRemove={handleRemoveAttachment}
      />

      <div className="px-4 py-3">
        {/* Slow mode indicator */}
        {slowModeDelay > 0 && !slowModeExempt && (
          <div className="flex items-center gap-1.5 text-xs text-text-muted mb-2">
            <Clock className="w-3 h-3" />
            <span>
              Slow mode: {slowModeDelay}s
              {remainingSeconds > 0 && ` (${remainingSeconds}s remaining)`}
            </span>
          </div>
        )}

        <div className="message-input-container flex items-center gap-3 p-2">
          {/* File attachment button - only show if user can send files */}
          {canSendFiles && (
            <FileAttachmentButton
              onFilesSelected={handleFilesSelected}
              disabled={isSending || !canSendMessages || !slowModeCanSend}
              currentCount={pendingAttachments.length}
            />
          )}

          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={
              !canSendMessages 
                ? "You don't have permission to send messages"
                : !slowModeCanSend
                  ? `Slow mode: wait ${remainingSeconds}s`
                  : `Message #${channelName}`
            }
            rows={1}
            disabled={isSending || !canSendMessages || !slowModeCanSend}
            className="flex-1 bg-transparent text-text-primary placeholder-text-muted resize-none focus:outline-none min-h-[24px] max-h-[200px]"
          />
          <button
            onClick={handleSend}
            disabled={!hasContent || isSending || !canSendMessages || !slowModeCanSend}
            className={`p-2 rounded-lg transition-colors shrink-0 ${
              hasContent && canSendMessages && slowModeCanSend
                ? "send-btn-active"
                : "text-text-muted cursor-not-allowed"
            }`}
            title={
              !canSendMessages 
                ? "You don't have permission to send messages"
                : !slowModeCanSend
                  ? `Slow mode: wait ${remainingSeconds}s`
                  : "Send message"
            }
          >
            {isSending ? (
              <svg
                className="w-5 h-5 animate-spin"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
