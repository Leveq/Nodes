import { useState, useRef, useEffect, useCallback } from "react";
import { useTransport } from "../../providers/TransportProvider";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import { FileAttachmentButton, type PendingAttachment } from "./FileAttachmentButton";
import { AttachmentPreview } from "./AttachmentPreview";
import type { FileAttachment } from "@nodes/core";

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
  const publicKey = useIdentityStore((s) => s.publicKey);
  const addToast = useToastStore((s) => s.addToast);

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

  // Clear typing indicator on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // Clear typing on unmount
      transport?.presence.setTyping(channelId, false).catch(() => {});
    };
  }, [channelId, transport]);

  const handleTyping = useCallback(() => {
    if (!transport || !content.trim()) return;

    // Set typing to true
    transport.presence.setTyping(channelId, true).catch(() => {});

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to clear typing after 3 seconds
    typingTimeoutRef.current = window.setTimeout(() => {
      transport.presence.setTyping(channelId, false).catch(() => {});
    }, 3000);
  }, [channelId, transport, content]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    handleTyping();
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    const hasAttachments = pendingAttachments.length > 0;

    if ((!trimmed && !hasAttachments) || !publicKey || !transport || isSending)
      return;

    // Check if IPFS is ready for file uploads
    if (hasAttachments && !ipfsReady) {
      addToast("warning", "IPFS is still initializing. Please wait a moment and try again.");
      return;
    }

    setIsSending(true);

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
      console.log('[MessageInput] Sending message with attachments:', attachments);
      await transport.message.send(channelId, {
        content: trimmed || "",
        authorKey: publicKey,
        type: hasAttachments ? "file" : "text",
        attachments: attachments.length > 0 ? JSON.stringify(attachments) : undefined,
      } as any);

      // Clear input and attachments
      setContent("");
      setPendingAttachments([]);

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
      requestAnimationFrame(() => textareaRef.current?.focus());
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

  return (
    <div className="border-t border-surface-border bg-depth-primary">
      {/* Attachment preview */}
      <AttachmentPreview
        attachments={pendingAttachments}
        onRemove={handleRemoveAttachment}
      />

      <div className="px-4 py-3">
        <div className="message-input-container flex items-center gap-3 p-2">
          {/* File attachment button */}
          <FileAttachmentButton
            onFilesSelected={handleFilesSelected}
            disabled={isSending}
            currentCount={pendingAttachments.length}
          />

          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={`Message #${channelName}`}
            rows={1}
            disabled={isSending}
            className="flex-1 bg-transparent text-text-primary placeholder-text-muted resize-none focus:outline-none min-h-[24px] max-h-[200px]"
          />
          <button
            onClick={handleSend}
            disabled={!hasContent || isSending}
            className={`p-2 rounded-lg transition-colors shrink-0 ${
              hasContent
                ? "send-btn-active"
                : "text-text-muted cursor-not-allowed"
            }`}
            title="Send message"
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
