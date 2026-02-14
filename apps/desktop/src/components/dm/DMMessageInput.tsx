import { useState, useRef, useEffect } from "react";
import { useDMStore } from "../../stores/dm-store";
import { useIdentityStore } from "../../stores/identity-store";
import type { KeyPair } from "@nodes/crypto";

interface DMMessageInputProps {
  recipientKey: string;
  recipientName: string;
}

/**
 * DMMessageInput is the text input for sending encrypted DMs.
 * Similar to MessageInput but uses the DM store for encrypted messaging.
 */
export function DMMessageInput({
  recipientKey,
  recipientName,
}: DMMessageInputProps) {
  const [content, setContent] = useState("");
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sendMessage = useDMStore((s) => s.sendMessage);
  const keypair = useIdentityStore((s) => s.keypair);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 200); // Max 8 rows
      textarea.style.height = `${newHeight}px`;
    }
  }, [content]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
  };

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed || !keypair || isSending) return;

    setIsSending(true);

    try {
      await sendMessage(trimmed, recipientKey, keypair as KeyPair);
      setContent("");

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }

      // Focus textarea after React re-render
      setTimeout(() => textareaRef.current?.focus(), 0);
    } catch {
      // Error already shown via toast in store
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter adds newline
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-4 py-3 border-t border-nodes-border shrink-0">
      <div className="message-input-container relative flex items-center bg-nodes-bg rounded-lg border border-nodes-border transition-all duration-300 focus-within:scale-[1.005]">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={`Message ${recipientName}`}
          disabled={isSending}
          rows={1}
          className="flex-1 bg-transparent px-4 py-3 pr-12 text-nodes-text placeholder-nodes-text-muted resize-none focus:outline-none disabled:opacity-50"
          style={{ maxHeight: "200px" }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!content.trim() || isSending}
          className="absolute right-2 bottom-2 p-2 rounded-lg text-nodes-text-muted hover:text-nodes-primary hover:bg-nodes-primary/10 transition-colors disabled:opacity-50 disabled:hover:text-nodes-text-muted disabled:hover:bg-transparent"
          title="Send message (Enter)"
        >
          {isSending ? (
            <svg
              className="w-5 h-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Encryption notice */}
      <p className="text-xs text-nodes-text-muted mt-2 flex items-center gap-1">
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
          <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
        </svg>
        End-to-end encrypted
      </p>
    </div>
  );
}
