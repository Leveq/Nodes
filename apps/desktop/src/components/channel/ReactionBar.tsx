import { useState, lazy, Suspense } from "react";
import { Plus } from "lucide-react";
import type { ReactionData } from "@nodes/transport";
import { useDisplayNames } from "../../hooks/useDisplayNames";
import { GunInstanceManager } from "@nodes/transport-gun";

// Type for emoji → reactions array mapping
type ReactionMap = Record<string, ReactionData[]>;

// Lazy load EmojiPicker to reduce initial bundle size
const EmojiPicker = lazy(() => import("./EmojiPicker"));

interface ReactionBarProps {
  reactions: ReactionMap;
  onAddReaction: (emoji: string) => void;
  onRemoveReaction: (emoji: string) => void;
  canAddReaction?: boolean;
}

/**
 * ReactionBar displays emoji reactions below a message.
 *
 * Format: [😂 3] [🔥 1] [👀 2] [+]
 *
 * - Each pill is clickable to toggle your reaction
 * - Hover shows who reacted
 * - [+] opens emoji picker to add new reaction (if user has permission)
 */
export function ReactionBar({
  reactions,
  onAddReaction,
  onRemoveReaction,
  canAddReaction = true,
}: ReactionBarProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [pickerPosition, setPickerPosition] = useState<{ x: number; y: number } | null>(null);

  // Get current user's public key
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentUserKey = (GunInstanceManager.user() as any).is?.pub;

  // Collect all unique user keys for display names
  const allUserKeys = Object.values(reactions)
    .flat()
    .map((r: ReactionData) => r.userKey);
  const uniqueUserKeys = [...new Set(allUserKeys)];
  const { displayNames } = useDisplayNames(uniqueUserKeys);

  // Check if current user has reacted with a specific emoji
  const hasReacted = (emoji: string): boolean => {
    const emojiReactions = reactions[emoji] || [];
    return emojiReactions.some((r: ReactionData) => r.userKey === currentUserKey);
  };

  // Get display names of users who reacted with an emoji
  const getReactorNames = (emojiReactions: ReactionData[]): string => {
    return emojiReactions
      .map((r: ReactionData) => displayNames[r.userKey] || r.userKey.slice(0, 8))
      .join(", ");
  };

  // Handle clicking a reaction pill
  const handlePillClick = (emoji: string) => {
    if (hasReacted(emoji)) {
      // Always allow removing your own reaction
      onRemoveReaction(emoji);
    } else if (canAddReaction) {
      // Only allow adding if user has permission
      onAddReaction(emoji);
    }
  };

  // Handle opening emoji picker
  const handleAddClick = (e: React.MouseEvent) => {
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setPickerPosition({
      x: Math.min(rect.left, window.innerWidth - 352), // 352px is picker width
      y: Math.max(0, rect.top - 400), // Position above button
    });
    setShowPicker(true);
  };

  // Handle selecting emoji from picker
  const handleEmojiSelect = (emoji: string) => {
    onAddReaction(emoji);
  };

  const emojiList = Object.keys(reactions);

  // Don't render if no reactions and not showing picker
  if (emojiList.length === 0 && !showPicker) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {/* Reaction pills */}
      {emojiList.map((emoji) => {
        const emojiReactions = reactions[emoji];
        const count = emojiReactions.length;
        const userReacted = hasReacted(emoji);

        return (
          <button
            key={emoji}
            onClick={() => handlePillClick(emoji)}
            title={getReactorNames(emojiReactions)}
            className={`
              flex items-center gap-1 px-2 py-0.5 rounded-full text-sm
              transition-colors duration-150
              ${
                userReacted
                  ? "bg-nodes-primary/20 border border-nodes-primary/50 text-nodes-text"
                  : "bg-nodes-surface border border-nodes-border text-nodes-text-muted hover:bg-nodes-surface/80"
              }
            `}
          >
            <span>{emoji}</span>
            <span className="text-xs">{count}</span>
          </button>
        );
      })}

      {/* Add reaction button - only show if user has permission */}
      {canAddReaction && (
        <button
          onClick={handleAddClick}
          className="flex items-center justify-center w-6 h-6 rounded-full 
                     bg-nodes-surface border border-nodes-border text-nodes-text-muted
                     hover:bg-nodes-surface/80 hover:text-nodes-text transition-colors"
          title="Add reaction"
        >
          <Plus size={14} />
        </button>
      )}

      {/* Emoji picker */}
      {showPicker && pickerPosition && (
        <Suspense
          fallback={
            <div className="fixed bg-nodes-depth rounded-lg p-4 shadow-xl z-50"
                 style={{ left: pickerPosition.x, top: pickerPosition.y }}>
              <div className="w-64 h-64 flex items-center justify-center">
                <div className="animate-spin w-6 h-6 border-2 border-nodes-primary border-t-transparent rounded-full" />
              </div>
            </div>
          }
        >
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => setShowPicker(false)}
            position={pickerPosition}
          />
        </Suspense>
      )}
    </div>
  );
}

export default ReactionBar;
