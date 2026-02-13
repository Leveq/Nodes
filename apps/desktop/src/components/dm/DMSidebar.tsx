import { useState, useEffect } from "react";
import { useDMStore } from "../../stores/dm-store";
import { useIdentityStore } from "../../stores/identity-store";
import { ProfileManager } from "@nodes/transport-gun";
import { formatRelativeTime } from "../../utils/time";
import { MemberListSkeleton, NameSkeleton } from "../ui";
import { NewDMModal } from "./NewDMModal";
import type { DMConversation } from "@nodes/core";
import type { KeyPair } from "@nodes/crypto";

const profileManager = new ProfileManager();

/**
 * DMSidebar displays the user's DM conversations.
 * Shows conversation list with recipient name, last message preview, and timestamp.
 */
export function DMSidebar({ onUserClick }: { onUserClick?: (userId: string) => void }) {
  const conversations = useDMStore((s) => s.conversations);
  const activeConversationId = useDMStore((s) => s.activeConversationId);
  const unreadCounts = useDMStore((s) => s.unreadCounts);
  const isLoading = useDMStore((s) => s.isLoading);
  const loadConversations = useDMStore((s) => s.loadConversations);
  const setActiveConversation = useDMStore((s) => s.setActiveConversation);
  
  const keypair = useIdentityStore((s) => s.keypair);
  
  const [showNewDM, setShowNewDM] = useState(false);
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Resolve display names for conversation recipients
  useEffect(() => {
    async function resolveNames() {
      const names: Record<string, string> = { ...resolvedNames };
      let hasNew = false;

      for (const conv of conversations) {
        if (!names[conv.recipientKey]) {
          hasNew = true;
          try {
            const profile = await profileManager.getPublicProfile(conv.recipientKey);
            names[conv.recipientKey] = profile?.displayName || conv.recipientKey.slice(0, 8);
          } catch {
            names[conv.recipientKey] = conv.recipientKey.slice(0, 8);
          }
        }
      }

      if (hasNew) {
        setResolvedNames(names);
      }
    }
    resolveNames();
  }, [conversations]);

  const handleSelectConversation = (conv: DMConversation) => {
    if (keypair) {
      setActiveConversation(conv.id, conv.recipientKey, keypair as KeyPair);
    }
  };

  // Sort by most recent first
  const sortedConversations = [...conversations].sort(
    (a, b) => b.lastMessageAt - a.lastMessageAt
  );

  return (
    <div className="w-[240px] bg-nodes-surface border-r border-nodes-border flex flex-col shrink-0">
      {/* Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-nodes-border">
        <span className="font-semibold text-nodes-text">Direct Messages</span>
        <button
          onClick={() => setShowNewDM(true)}
          className="text-nodes-text-muted hover:text-nodes-text transition-colors"
          title="New Message"
        >
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
              d="M12 4v16m8-8H4"
            />
          </svg>
        </button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && conversations.length === 0 ? (
          <MemberListSkeleton />
        ) : sortedConversations.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <div className="w-12 h-12 rounded-full bg-nodes-bg flex items-center justify-center mx-auto mb-3">
              <svg
                className="w-6 h-6 text-nodes-text-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <p className="text-nodes-text-muted text-sm mb-2">
              No conversations yet
            </p>
            <p className="text-nodes-text-muted text-xs">
              Start one by clicking a member's name or the + button.
            </p>
          </div>
        ) : (
          sortedConversations.map((conv) => (
            <ConversationItem
              key={conv.id}
              conversation={conv}
              displayName={resolvedNames[conv.recipientKey]}
              isNameLoading={!resolvedNames[conv.recipientKey]}
              isActive={conv.id === activeConversationId}
              unreadCount={unreadCounts[conv.id] || 0}
              onClick={() => handleSelectConversation(conv)}
              onAvatarClick={() => onUserClick?.(conv.recipientKey)}
            />
          ))
        )}
      </div>

      {/* New DM Modal */}
      {showNewDM && <NewDMModal onClose={() => setShowNewDM(false)} />}
    </div>
  );
}

interface ConversationItemProps {
  conversation: DMConversation;
  displayName?: string;
  isNameLoading: boolean;
  isActive: boolean;
  unreadCount: number;
  onClick: () => void;
  onAvatarClick?: () => void;
}

function ConversationItem({
  conversation,
  displayName,
  isNameLoading,
  isActive,
  unreadCount,
  onClick,
  onAvatarClick,
}: ConversationItemProps) {
  const initial = isNameLoading ? "" : (displayName?.[0]?.toUpperCase() || "?");

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAvatarClick?.();
  };

  return (
    <button
      onClick={onClick}
      className={`w-full px-2 py-2 flex items-start gap-3 hover:bg-nodes-bg/50 transition-colors ${
        isActive ? "bg-nodes-bg" : ""
      }`}
    >
      {/* Avatar - clickable for profile */}
      <div 
        onClick={handleAvatarClick}
        className="w-10 h-10 rounded-full bg-nodes-primary/20 flex items-center justify-center shrink-0 hover:ring-2 hover:ring-nodes-primary/50 cursor-pointer transition-all"
      >
        {isNameLoading ? (
          <div className="w-4 h-4 animate-pulse rounded bg-nodes-border/50" />
        ) : (
          <span className="text-nodes-primary font-medium">{initial}</span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center justify-between gap-2">
          {isNameLoading ? (
            <NameSkeleton width="w-24" />
          ) : (
            <span
              className={`font-medium truncate ${
                unreadCount > 0 ? "text-nodes-text" : "text-nodes-text"
              }`}
            >
              {displayName}
            </span>
          )}
          {unreadCount > 0 && (
            <span className="bg-nodes-primary text-white text-xs px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span className="text-xs text-nodes-text-muted truncate">
            {conversation.lastMessagePreview || "No messages yet"}
          </span>
          <span className="text-xs text-nodes-text-muted shrink-0">
            {formatRelativeTime(conversation.lastMessageAt)}
          </span>
        </div>
      </div>
    </button>
  );
}
