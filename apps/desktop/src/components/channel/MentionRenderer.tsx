import { useMemo } from "react";
import { parseMessageSegments } from "@nodes/core";
import { useDisplayName } from "../../hooks/useDisplayName";
import { useIdentityStore } from "../../stores/identity-store";

interface MentionRendererProps {
  content: string;
  className?: string;
}

/**
 * MentionRenderer parses message content and renders mentions with highlights
 * 
 * - @user mentions show as highlighted badges with display name
 * - @everyone/@here show as highlighted badges
 * - Mentions of current user are extra highlighted
 */
export function MentionRenderer({ content, className = "" }: MentionRendererProps) {
  const segments = useMemo(() => parseMessageSegments(content), [content]);
  const currentUserKey = useIdentityStore((s) => s.publicKey);

  return (
    <span className={className}>
      {segments.map((segment, index) => {
        switch (segment.type) {
          case "text":
            return <span key={index}>{segment.content}</span>;
          
          case "user_mention":
            return (
              <UserMention
                key={index}
                publicKey={segment.publicKey}
                isCurrentUser={segment.publicKey === currentUserKey}
              />
            );
          
          case "role_mention":
            return (
              <RoleMention
                key={index}
                roleId={segment.roleId}
              />
            );
          
          case "everyone":
            return (
              <span
                key={index}
                className="inline-flex items-center px-1 py-0.5 rounded bg-warning/20 text-warning font-medium text-sm"
              >
                @everyone
              </span>
            );
          
          case "here":
            return (
              <span
                key={index}
                className="inline-flex items-center px-1 py-0.5 rounded bg-success/20 text-success font-medium text-sm"
              >
                @here
              </span>
            );
          
          default:
            return null;
        }
      })}
    </span>
  );
}

/**
 * Renders a user mention with their display name
 */
function UserMention({
  publicKey,
  isCurrentUser,
}: {
  publicKey: string;
  isCurrentUser: boolean;
}) {
  const { displayName, isLoading } = useDisplayName(publicKey);
  
  const name = isLoading
    ? publicKey.slice(0, 8) + "..."
    : displayName || publicKey.slice(0, 8);

  // Current user mentions get extra highlight
  const bgColor = isCurrentUser
    ? "bg-accent-primary/30"
    : "bg-accent-primary/20";
  
  const textColor = isCurrentUser
    ? "text-accent-primary"
    : "text-accent-secondary";

  return (
    <span
      className={`inline-flex items-center px-1 py-0.5 rounded ${bgColor} ${textColor} font-medium text-sm cursor-pointer hover:brightness-110 transition-all`}
      title={publicKey}
    >
      @{name}
    </span>
  );
}

/**
 * Renders a role mention (placeholder for future role support)
 */
function RoleMention({ roleId }: { roleId: string }) {
  // TODO: Look up role name from node roles
  const roleName = roleId === "admin" ? "Admin" : roleId === "moderator" ? "Moderator" : roleId;

  return (
    <span
      className="inline-flex items-center px-1 py-0.5 rounded bg-info/20 text-info font-medium text-sm"
      title={`Role: ${roleId}`}
    >
      @{roleName}
    </span>
  );
}

export default MentionRenderer;
