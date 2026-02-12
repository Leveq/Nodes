import { useState, useRef, useEffect, useCallback } from "react";
import { useTransport } from "../../providers/TransportProvider";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";

interface MessageInputProps {
  channelId: string;
  channelName: string;
}

/**
 * MessageInput is the text input for sending messages.
 *
 * - Enter sends the message (if not empty after trimming)
 * - Shift+Enter inserts a newline (multi-line support)
 * - Input clears after successful send
 * - Shows placeholder: "Message #channel-name"
 *
 * Also handles typing indicator:
 * - On input change (debounced): set typing to true
 * - After 3 seconds of no input: set typing to false
 * - On send: immediately clear typing
 */
export function MessageInput({ channelId, channelName }: MessageInputProps) {
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<number | null>(null);

  const transport = useTransport();
  const publicKey = useIdentityStore((s) => s.publicKey);
  const addToast = useToastStore((s) => s.addToast);

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
    if (!trimmed || !publicKey || !transport || isSending) return;

    setIsSending(true);

    try {
      await transport.message.send(channelId, {
        content: trimmed,
        authorKey: publicKey,
        type: "text",
      });

      // Clear input
      setContent("");

      // Clear typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      transport.presence.setTyping(channelId, false).catch(() => {});

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      // Focus textarea
      textareaRef.current?.focus();
    } catch {
      addToast("error", "Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasContent = content.trim().length > 0;

  return (
    <div className="px-4 py-3 border-t border-surface-border bg-depth-primary">
      <div className="message-input-container flex items-end gap-3 p-2">
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
        </button>
      </div>
    </div>
  );
}
