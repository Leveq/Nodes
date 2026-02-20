import { useEffect, useRef, useMemo } from "react";
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";
import { useThemeStore } from "../../stores/theme-store";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  position?: { x: number; y: number };
}

/**
 * Determine if a hex color is "light" (luminance > 0.5)
 */
function isLightColor(hex: string): boolean {
  // Remove # if present
  const color = hex.replace("#", "");
  const r = parseInt(color.substring(0, 2), 16);
  const g = parseInt(color.substring(2, 4), 16);
  const b = parseInt(color.substring(4, 6), 16);
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
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
  const getActiveTheme = useThemeStore((s) => s.getActiveTheme);
  
  // Determine emoji-mart theme based on app theme
  const emojiTheme = useMemo(() => {
    const theme = getActiveTheme();
    // Check if the background color is light
    return isLightColor(theme.colors.bgPrimary) ? "light" : "dark";
  }, [getActiveTheme]);

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
        theme={emojiTheme}
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
