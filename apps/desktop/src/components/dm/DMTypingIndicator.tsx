import { useMemo } from "react";
import { useDMStore } from "../../stores/dm-store";
import { useIdentityStore } from "../../stores/identity-store";
import { useDisplayNames } from "../../hooks/useDisplayNames";

interface DMTypingIndicatorProps {
  conversationId: string;
}

const EMPTY_ARRAY: string[] = [];

/**
 * DMTypingIndicator displays who is currently typing in the DM conversation.
 * For DMs this is typically just one other person.
 */
export function DMTypingIndicator({ conversationId }: DMTypingIndicatorProps) {
  const typingUsers = useDMStore((s) => s.typingUsers[conversationId] ?? EMPTY_ARRAY);
  const currentUserKey = useIdentityStore((s) => s.publicKey);

  // Filter out current user
  const otherTypingUsers = useMemo(
    () => typingUsers.filter((key) => key !== currentUserKey),
    [typingUsers, currentUserKey]
  );
  const { displayNames } = useDisplayNames(otherTypingUsers);

  if (otherTypingUsers.length === 0) {
    return <div className="h-0 overflow-hidden transition-all duration-200" />;
  }

  const getTypingText = () => {
    const names = otherTypingUsers.map(
      (key) => displayNames[key] || key.slice(0, 8)
    );

    if (names.length === 1) {
      return `${names[0]} is typing`;
    }
    // For DMs it's usually just one person, but handle edge cases
    return "typing";
  };

  return (
    <div className="h-6 px-4 flex items-center gap-2 text-sm text-nodes-text-muted overflow-hidden transition-all duration-200">
      <div className="flex gap-1">
        <span className="typing-dot w-1.5 h-1.5 bg-nodes-text-muted rounded-full" />
        <span
          className="typing-dot w-1.5 h-1.5 bg-nodes-text-muted rounded-full"
          style={{ animationDelay: "-0.16s" }}
        />
        <span
          className="typing-dot w-1.5 h-1.5 bg-nodes-text-muted rounded-full"
          style={{ animationDelay: "-0.32s" }}
        />
      </div>
      <span>{getTypingText()}...</span>

      <style>{`
        .typing-dot {
          animation: typingBounce 1.4s infinite ease-in-out both;
        }
        @keyframes typingBounce {
          0%, 80%, 100% { transform: scale(0.4); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
