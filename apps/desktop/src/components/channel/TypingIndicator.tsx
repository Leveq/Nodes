import { useMemo } from "react";
import { useMessageStore } from "../../stores/message-store";
import { useIdentityStore } from "../../stores/identity-store";
import { useDisplayNames } from "../../hooks/useDisplayNames";

interface TypingIndicatorProps {
  channelId: string;
}

const EMPTY_ARRAY: string[] = [];

/**
 * TypingIndicator displays who is currently typing in the channel.
 *
 * Display rules:
 * - 0 users typing: render nothing (no space taken)
 * - 1 user: "kdogg is typing..."
 * - 2 users: "kdogg and user2 are typing..."
 * - 3+ users: "Several people are typing..."
 * - Never show the current user in the typing list
 */
export function TypingIndicator({ channelId }: TypingIndicatorProps) {
  const typingUsers = useMessageStore((s) => s.typingUsers[channelId] ?? EMPTY_ARRAY);
  const currentUserKey = useIdentityStore((s) => s.publicKey);

  // Filter out current user - memoize to avoid recreating array each render
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
    if (names.length === 2) {
      return `${names[0]} and ${names[1]} are typing`;
    }
    return "Several people are typing";
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

      {/* CSS Animation - will be added to global styles */}
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
