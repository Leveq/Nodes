import { useState, useRef, useEffect } from "react";
import { X, Check } from "lucide-react";

interface MessageEditorProps {
  initialContent: string;
  onSave: (newContent: string) => Promise<void>;
  onCancel: () => void;
}

/**
 * MessageEditor is an inline editor for editing message content.
 *
 * - Shows in place of the original message content
 * - Enter saves (if changed), Escape cancels
 * - Save button disabled if content unchanged
 */
export function MessageEditor({
  initialContent,
  onSave,
  onCancel,
}: MessageEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus and select all
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const newHeight = Math.min(textarea.scrollHeight, 300);
      textarea.style.height = `${newHeight}px`;
    }
  }, [content]);

  const hasChanges = content !== initialContent;
  const canSave = hasChanges && content.trim().length > 0 && !isSaving;

  const handleSave = async () => {
    if (!canSave) return;

    setIsSaving(true);
    try {
      await onSave(content.trim());
    } catch (err) {
      console.error("Failed to save edit:", err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSave) {
        handleSave();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="bg-nodes-surface/50 rounded-lg p-2 mt-1">
      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
        className="w-full bg-transparent text-nodes-text resize-none focus:outline-none min-h-[24px] max-h-[300px]"
        rows={1}
      />
      <div className="flex items-center justify-between mt-2">
        <span className="text-xs text-nodes-text-muted">
          Escape to cancel, Enter to save
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="flex items-center gap-1 px-2 py-1 rounded text-sm text-nodes-text-muted hover:text-nodes-text hover:bg-nodes-border/30 transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
              canSave
                ? "bg-nodes-primary text-white hover:bg-nodes-primary/80"
                : "bg-nodes-border/30 text-nodes-text-muted cursor-not-allowed"
            }`}
          >
            <Check className="w-4 h-4" />
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
