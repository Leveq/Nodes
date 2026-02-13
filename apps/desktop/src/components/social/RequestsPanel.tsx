import { useState, useEffect } from "react";
import { useSocialStore } from "../../stores/social-store";
import { ProfileManager } from "@nodes/transport-gun";
import { NameSkeleton } from "../ui";
import type { FriendRequest, Friend } from "@nodes/core";

const profileManager = new ProfileManager();

type TabType = "friends" | "incoming" | "outgoing" | "blocked";

/**
 * RequestsPanel displays friend requests, friends list, and blocked users.
 * Provides UI for accepting/declining requests and managing friends.
 */
export function RequestsPanel({ onUserClick }: { onUserClick?: (userId: string) => void }) {
  const [activeTab, setActiveTab] = useState<TabType>("friends");
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  const friends = useSocialStore((s) => s.friends);
  const incomingRequests = useSocialStore((s) => s.incomingRequests);
  const outgoingRequests = useSocialStore((s) => s.outgoingRequests);
  const blockedUsers = useSocialStore((s) => s.blockedUsers);
  const acceptRequest = useSocialStore((s) => s.acceptRequest);
  const declineRequest = useSocialStore((s) => s.declineRequest);
  const cancelRequest = useSocialStore((s) => s.cancelRequest);
  const removeFriend = useSocialStore((s) => s.removeFriend);
  const unblockUser = useSocialStore((s) => s.unblockUser);

  // Collect all public keys that need name resolution
  useEffect(() => {
    async function resolveNames() {
      const allKeys = new Set<string>();
      
      friends.forEach((f) => allKeys.add(f.publicKey));
      incomingRequests.forEach((r) => allKeys.add(r.fromKey));
      outgoingRequests.forEach((r) => allKeys.add(r.toKey));
      blockedUsers.forEach((b) => allKeys.add(b.publicKey));

      const names: Record<string, string> = { ...resolvedNames };
      let hasNew = false;

      for (const key of allKeys) {
        if (!names[key]) {
          hasNew = true;
          try {
            const profile = await profileManager.getPublicProfile(key);
            names[key] = profile?.displayName || key.slice(0, 8);
          } catch {
            names[key] = key.slice(0, 8);
          }
        }
      }

      if (hasNew) {
        setResolvedNames(names);
      }
    }
    resolveNames();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- resolvedNames is intentionally excluded to prevent infinite loops
  }, [friends, incomingRequests, outgoingRequests, blockedUsers]);

  const getName = (publicKey: string) => resolvedNames[publicKey];
  const isNameLoading = (publicKey: string) => !resolvedNames[publicKey];

  return (
    <div className="w-70 bg-nodes-surface border-r border-nodes-border flex flex-col shrink-0">
      {/* Header */}
      <div className="h-12 px-4 flex items-center border-b border-nodes-border">
        <span className="font-semibold text-nodes-text">Friends</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-nodes-border">
        <TabButton
          label="Friends"
          isActive={activeTab === "friends"}
          count={friends.length}
          onClick={() => setActiveTab("friends")}
        />
        <TabButton
          label="Incoming"
          isActive={activeTab === "incoming"}
          count={incomingRequests.length}
          showBadge={incomingRequests.length > 0}
          onClick={() => setActiveTab("incoming")}
        />
        <TabButton
          label="Pending"
          isActive={activeTab === "outgoing"}
          count={outgoingRequests.length}
          onClick={() => setActiveTab("outgoing")}
        />
        <TabButton
          label="Blocked"
          isActive={activeTab === "blocked"}
          count={blockedUsers.length}
          onClick={() => setActiveTab("blocked")}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-2">
        {activeTab === "friends" && (
          <FriendsList
            friends={friends}
            getName={getName}
            isNameLoading={isNameLoading}
            onRemove={removeFriend}
            onUserClick={onUserClick}
          />
        )}
        {activeTab === "incoming" && (
          <IncomingRequests
            requests={incomingRequests}
            getName={getName}
            isNameLoading={isNameLoading}
            onAccept={acceptRequest}
            onDecline={declineRequest}
            onUserClick={onUserClick}
          />
        )}
        {activeTab === "outgoing" && (
          <OutgoingRequests
            requests={outgoingRequests}
            getName={getName}
            isNameLoading={isNameLoading}
            onCancel={cancelRequest}
            onUserClick={onUserClick}
          />
        )}
        {activeTab === "blocked" && (
          <BlockedList
            blockedUsers={blockedUsers}
            getName={getName}
            isNameLoading={isNameLoading}
            onUnblock={unblockUser}
            onUserClick={onUserClick}
          />
        )}
      </div>
    </div>
  );
}

interface TabButtonProps {
  label: string;
  isActive: boolean;
  count: number;
  showBadge?: boolean;
  onClick: () => void;
}

function TabButton({ label, isActive, count, showBadge, onClick }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-2 py-2 text-xs font-medium transition-colors relative ${
        isActive
          ? "text-nodes-primary border-b-2 border-nodes-primary"
          : "text-nodes-text-muted hover:text-nodes-text"
      }`}
    >
      {label}
      {showBadge && count > 0 && (
        <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  );
}

interface FriendsListProps {
  friends: Friend[];
  getName: (key: string) => string | undefined;
  isNameLoading: (key: string) => boolean;
  onRemove: (publicKey: string) => Promise<void>;
  onUserClick?: (userId: string) => void;
}

function FriendsList({ friends, getName, isNameLoading, onRemove, onUserClick }: FriendsListProps) {
  if (friends.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        }
        text="No friends yet"
        subtext="Send a friend request to someone in your Nodes!"
      />
    );
  }

  return (
    <div className="space-y-1 px-2">
      {friends.map((friend) => (
        <div
          key={friend.publicKey}
          className="flex items-center gap-3 p-2 rounded hover:bg-nodes-bg group"
        >
          <Avatar 
            name={getName(friend.publicKey)} 
            isLoading={isNameLoading(friend.publicKey)} 
            onClick={() => onUserClick?.(friend.publicKey)}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-nodes-text truncate">
              {isNameLoading(friend.publicKey) ? <NameSkeleton width="w-24" /> : getName(friend.publicKey)}
            </p>
            <p className="text-xs text-nodes-text-muted truncate">
              {friend.publicKey.slice(0, 16)}...
            </p>
          </div>
          <button
            onClick={() => onRemove(friend.publicKey)}
            className="opacity-0 group-hover:opacity-100 p-1 text-nodes-text-muted hover:text-red-500 transition-all"
            title="Remove friend"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

interface IncomingRequestsProps {
  requests: FriendRequest[];
  getName: (key: string) => string | undefined;
  isNameLoading: (key: string) => boolean;
  onAccept: (requestId: string) => Promise<void>;
  onDecline: (requestId: string) => Promise<void>;
  onUserClick?: (userId: string) => void;
}

function IncomingRequests({ requests, getName, isNameLoading, onAccept, onDecline, onUserClick }: IncomingRequestsProps) {
  if (requests.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        }
        text="No incoming requests"
        subtext="When someone sends you a friend request, it will appear here."
      />
    );
  }

  return (
    <div className="space-y-2 px-2">
      {requests.map((request) => (
        <div
          key={request.id}
          className="p-3 rounded bg-nodes-bg border border-nodes-border"
        >
          <div className="flex items-center gap-3 mb-2">
            <Avatar 
              name={getName(request.fromKey)} 
              isLoading={isNameLoading(request.fromKey)} 
              onClick={() => onUserClick?.(request.fromKey)}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-nodes-text truncate">
                {isNameLoading(request.fromKey) ? <NameSkeleton width="w-24" /> : getName(request.fromKey)}
              </p>
              {request.message && (
                <p className="text-xs text-nodes-text-muted truncate italic">
                  &quot;{request.message}&quot;
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onAccept(request.id)}
              className="flex-1 px-3 py-1.5 text-xs font-medium bg-nodes-primary text-white rounded hover:bg-nodes-primary/90 transition-colors"
            >
              Accept
            </button>
            <button
              onClick={() => onDecline(request.id)}
              className="flex-1 px-3 py-1.5 text-xs font-medium bg-nodes-surface text-nodes-text-muted rounded hover:bg-nodes-bg transition-colors border border-nodes-border"
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

interface OutgoingRequestsProps {
  requests: FriendRequest[];
  getName: (key: string) => string | undefined;
  isNameLoading: (key: string) => boolean;
  onCancel: (requestId: string) => Promise<void>;
  onUserClick?: (userId: string) => void;
}

function OutgoingRequests({ requests, getName, isNameLoading, onCancel, onUserClick }: OutgoingRequestsProps) {
  if (requests.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        }
        text="No pending requests"
        subtext="Friend requests you send will appear here until they're accepted."
      />
    );
  }

  return (
    <div className="space-y-2 px-2">
      {requests.map((request) => (
        <div
          key={request.id}
          className="p-3 rounded bg-nodes-bg border border-nodes-border"
        >
          <div className="flex items-center gap-3">
            <Avatar 
              name={getName(request.toKey)} 
              isLoading={isNameLoading(request.toKey)} 
              onClick={() => onUserClick?.(request.toKey)}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-nodes-text truncate">
                {isNameLoading(request.toKey) ? <NameSkeleton width="w-24" /> : getName(request.toKey)}
              </p>
              <p className="text-xs text-nodes-text-muted">Pending...</p>
            </div>
            <button
              onClick={() => onCancel(request.id)}
              className="px-2 py-1 text-xs font-medium text-nodes-text-muted hover:text-red-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

interface BlockedListProps {
  blockedUsers: { publicKey: string; blockedAt: number }[];
  getName: (key: string) => string | undefined;
  isNameLoading: (key: string) => boolean;
  onUnblock: (publicKey: string) => Promise<void>;
  onUserClick?: (userId: string) => void;
}

function BlockedList({ blockedUsers, getName, isNameLoading, onUnblock, onUserClick }: BlockedListProps) {
  if (blockedUsers.length === 0) {
    return (
      <EmptyState
        icon={
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        }
        text="No blocked users"
        subtext="Users you block will appear here."
      />
    );
  }

  return (
    <div className="space-y-1 px-2">
      {blockedUsers.map((blocked) => (
        <div
          key={blocked.publicKey}
          className="flex items-center gap-3 p-2 rounded hover:bg-nodes-bg"
        >
          <Avatar 
            name={getName(blocked.publicKey)} 
            isLoading={isNameLoading(blocked.publicKey)} 
            muted 
            onClick={() => onUserClick?.(blocked.publicKey)}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-nodes-text-muted truncate">
              {isNameLoading(blocked.publicKey) ? <NameSkeleton width="w-24" /> : getName(blocked.publicKey)}
            </p>
          </div>
          <button
            onClick={() => onUnblock(blocked.publicKey)}
            className="px-2 py-1 text-xs font-medium text-nodes-text-muted hover:text-nodes-text transition-colors"
          >
            Unblock
          </button>
        </div>
      ))}
    </div>
  );
}

interface AvatarProps {
  name?: string;
  isLoading?: boolean;
  muted?: boolean;
  onClick?: () => void;
}

function Avatar({ name, isLoading, muted, onClick }: AvatarProps) {
  return (
    <div
      onClick={onClick}
      className={`w-8 h-8 rounded-full flex items-center justify-center ${
        muted ? "bg-nodes-bg" : "bg-nodes-primary/20"
      } ${onClick ? "cursor-pointer hover:ring-2 hover:ring-nodes-primary/50 transition-all" : ""}`}
    >
      {isLoading ? (
        <div className="w-3 h-3 animate-pulse rounded bg-nodes-border/50" />
      ) : (
        <span
          className={`text-sm font-medium ${
            muted ? "text-nodes-text-muted" : "text-nodes-primary"
          }`}
        >
          {name?.[0]?.toUpperCase() || "?"}
        </span>
      )}
    </div>
  );
}

interface EmptyStateProps {
  icon: React.ReactNode;
  text: string;
  subtext: string;
}

function EmptyState({ icon, text, subtext }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
      <div className="text-nodes-text-muted mb-3">{icon}</div>
      <p className="text-sm font-medium text-nodes-text mb-1">{text}</p>
      <p className="text-xs text-nodes-text-muted">{subtext}</p>
    </div>
  );
}
