import { useEffect, useRef } from "react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  position?: { x: number; y: number };
}

/**
 * EmojiPicker renders an emoji picker dialog.
 *
 * Uses emoji-mart for a full-featured picker with:
 * - Search
 * - Categories (smileys, people, nature, food, objects, symbols)
 * - Skin tone support
 * - Recent emoji
 */
export function EmojiPicker({ onSelect, onClose, position }: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key only - click outside is handled by parent backdrop
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  // Handle emoji selection
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleEmojiSelect = (emoji: any) => {
    console.log('[EmojiPicker] Emoji selected:', emoji.native);
    onSelect(emoji.native);
    onClose();
  };

  // Calculate position style
  const positionStyle = position
    ? {
        position: "fixed" as const,
        left: position.x,
        top: position.y,
        zIndex: 50,
      }
    : {};

  return (
    <div
      ref={containerRef}
      style={positionStyle}
      className="shadow-2xl rounded-lg overflow-hidden"
    >
      <Picker
        data={data}
        onEmojiSelect={handleEmojiSelect}
        theme="dark"
        previewPosition="none"
        skinTonePosition="search"
        maxFrequentRows={2}
        navPosition="bottom"
        perLine={8}
      />
    </div>
  );
}

export default EmojiPicker;
