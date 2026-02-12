import { useEffect, useMemo, useState, useRef } from "react";
import { useNodeStore } from "../stores/node-store";
import { useDMStore } from "../stores/dm-store";
import { useSocialStore } from "../stores/social-store";
import { useIdentityStore } from "../stores/identity-store";
import { useNavigationStore } from "../stores/navigation-store";
import { ProfileManager } from "@nodes/transport-gun";
import { MemberListSkeleton } from "../components/ui";
import type { NodeMember } from "@nodes/core";
import type { KeyPair } from "@nodes/crypto";

const profileManager = new ProfileManager();

/**
 * MemberSidebar displays the member list for the active Node.
 * Members are grouped by role (Owner, Members) with presence dots.
 */
export function MemberSidebar({ onUserClick }: { onUserClick?: (userId: string) => void }) {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const members = useNodeStore((s) => s.members);
  const nodeMembers = useMemo(
    () => (activeNodeId ? members[activeNodeId] || [] : []),
    [activeNodeId, members]
  );
  const isMembersLoading = activeNodeId ? members[activeNodeId] === undefined : false;
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
  const resolvedNamesRef = useRef<Record<string, string>>({});

  // DM functionality
  const startConversation = useDMStore((s) => s.startConversation);
  const setActiveConversation = useDMStore((s) => s.setActiveConversation);
  const keypair = useIdentityStore((s) => s.keypair);
  const myPublicKey = useIdentityStore((s) => s.publicKey);
  const setViewMode = useNavigationStore((s) => s.setViewMode);

  // Social functionality
  const friends = useSocialStore((s) => s.friends);
  const sendRequest = useSocialStore((s) => s.sendRequest);
  const removeFriend = useSocialStore((s) => s.removeFriend);
  const blockUser = useSocialStore((s) => s.blockUser);
  const hasPendingRequest = useSocialStore((s) => s.hasPendingRequest);

  // Handler for starting a DM with a member
  const handleSendMessage = async (publicKey: string) => {
    if (!keypair) return;
    
    try {
      const conversationId = await startConversation(publicKey, keypair as KeyPair);
      await setActiveConversation(conversationId, publicKey, keypair as KeyPair);
      setViewMode("dm");
    } catch {
      // Error already shown via toast
    }
  };

  // Handler for sending a friend request
  const handleAddFriend = async (publicKey: string) => {
    if (!myPublicKey) return;
    await sendRequest(myPublicKey, publicKey);
  };

  // Helper to check if someone is a friend
  const isFriend = (publicKey: string) => friends.some((f) => f.publicKey === publicKey);

  // Resolve display names for members
  useEffect(() => {
    async function resolveNames() {
      const names: Record<string, string> = {};
      let hasNewNames = false;
      
      for (const member of nodeMembers) {
        if (!resolvedNamesRef.current[member.publicKey]) {
          hasNewNames = true;
          try {
            const profile = await profileManager.getPublicProfile(member.publicKey);
            names[member.publicKey] = profile?.displayName || member.publicKey.slice(0, 8);
          } catch {
            names[member.publicKey] = member.publicKey.slice(0, 8);
          }
        }
      }
      
      if (hasNewNames && Object.keys(names).length > 0) {
        resolvedNamesRef.current = { ...resolvedNamesRef.current, ...names };
        setResolvedNames(resolvedNamesRef.current);
      }
    }
    resolveNames();
  }, [nodeMembers]);

  if (!activeNodeId) {
    return null;
  }

  // Group members by role
  const owners = nodeMembers.filter((m) => m.role === "owner");
  const admins = nodeMembers.filter((m) => m.role === "admin");
  const regularMembers = nodeMembers.filter((m) => m.role === "member");

  return (
    <div className="w-60 bg-depth-secondary border-l border-surface-border flex flex-col shrink-0">
      <div className="p-4 border-b border-surface-border">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          Members{!isMembersLoading && ` — ${nodeMembers.length}`}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {isMembersLoading ? (
          <MemberListSkeleton />
        ) : (
          <>
            {/* Owners */}
            {owners.length > 0 && (
              <MemberGroup
                title="Owner"
                members={owners}
                resolvedNames={resolvedNames}
                myPublicKey={myPublicKey}
                onSendMessage={handleSendMessage}
                onAddFriend={handleAddFriend}
                onRemoveFriend={removeFriend}
                onBlockUser={blockUser}
                isFriend={isFriend}
                hasPendingRequest={hasPendingRequest}
                onUserClick={onUserClick}
              />
            )}

            {/* Admins */}
            {admins.length > 0 && (
              <MemberGroup
                title="Admins"
                members={admins}
                resolvedNames={resolvedNames}
                myPublicKey={myPublicKey}
                onSendMessage={handleSendMessage}
                onAddFriend={handleAddFriend}
                onRemoveFriend={removeFriend}
                onBlockUser={blockUser}
                isFriend={isFriend}
                hasPendingRequest={hasPendingRequest}
                onUserClick={onUserClick}
              />
            )}

            {/* Regular members */}
            {regularMembers.length > 0 && (
              <MemberGroup
                title="Members"
                members={regularMembers}
                resolvedNames={resolvedNames}
                myPublicKey={myPublicKey}
                onSendMessage={handleSendMessage}
                onAddFriend={handleAddFriend}
                onRemoveFriend={removeFriend}
                onBlockUser={blockUser}
                isFriend={isFriend}
                hasPendingRequest={hasPendingRequest}
                onUserClick={onUserClick}
              />
            )}

            {nodeMembers.length === 0 && (
              <p className="px-4 py-4 text-nodes-text-muted text-sm">
                No members found.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface MemberGroupProps {
  title: string;
  members: NodeMember[];
  resolvedNames: Record<string, string>;
  myPublicKey: string | null;
  onSendMessage: (publicKey: string) => void;
  onAddFriend: (publicKey: string) => Promise<void>;
  onRemoveFriend: (publicKey: string) => Promise<void>;
  onBlockUser: (publicKey: string) => Promise<void>;
  isFriend: (publicKey: string) => boolean;
  hasPendingRequest: (toKey: string) => boolean;
  onUserClick?: (userId: string) => void;
}

function MemberGroup({ 
  title, 
  members, 
  resolvedNames, 
  myPublicKey, 
  onSendMessage,
  onAddFriend,
  onRemoveFriend,
  onBlockUser,
  isFriend,
  hasPendingRequest,
  onUserClick,
}: MemberGroupProps) {
  return (
    <div className="px-2 mb-4">
      <h4 className="px-2 text-xs font-semibold text-nodes-text-muted uppercase tracking-wide mb-1">
        {title} — {members.length}
      </h4>
      {members.map((member) => (
        <MemberItem
          key={member.publicKey}
          publicKey={member.publicKey}
          displayName={resolvedNames[member.publicKey] || member.publicKey.slice(0, 8)}
          status={member.status}
          isMe={member.publicKey === myPublicKey}
          isFriend={isFriend(member.publicKey)}
          hasPending={hasPendingRequest(member.publicKey)}
          onSendMessage={() => onSendMessage(member.publicKey)}
          onAddFriend={() => onAddFriend(member.publicKey)}
          onRemoveFriend={() => onRemoveFriend(member.publicKey)}
          onBlockUser={() => onBlockUser(member.publicKey)}
          onViewProfile={onUserClick ? () => onUserClick(member.publicKey) : undefined}
        />
      ))}
    </div>
  );
}

interface MemberItemProps {
  publicKey: string;
  displayName: string;
  status?: string;
  isMe: boolean;
  isFriend: boolean;
  hasPending: boolean;
  onSendMessage: () => void;
  onAddFriend: () => Promise<void>;
  onRemoveFriend: () => Promise<void>;
  onBlockUser: () => Promise<void>;
  onViewProfile?: () => void;
}

function MemberItem({ 
  displayName, 
  status, 
  isMe, 
  isFriend,
  hasPending,
  onSendMessage,
  onAddFriend,
  onRemoveFriend,
  onBlockUser,
  onViewProfile,
}: MemberItemProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // Determine status color
  const statusColor =
    status === "online"
      ? "bg-nodes-accent"
      : status === "idle"
      ? "bg-yellow-500"
      : status === "dnd"
      ? "bg-red-500"
      : "bg-gray-500";

  const handleClick = () => {
    if (!isMe && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Position menu to the left of the button
      setMenuPosition({
        top: rect.top,
        left: rect.left - 168, // 160px menu width + 8px gap
      });
      setShowMenu(!showMenu);
    }
  };

  const handleSendMessage = () => {
    setShowMenu(false);
    onSendMessage();
  };

  const handleAddFriend = async () => {
    setShowMenu(false);
    await onAddFriend();
  };

  const handleRemoveFriend = async () => {
    setShowMenu(false);
    await onRemoveFriend();
  };

  const handleBlockUser = async () => {
    setShowMenu(false);
    await onBlockUser();
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={handleClick}
        className={`w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-nodes-bg/50 transition-colors ${
          isMe ? "cursor-default" : "cursor-pointer"
        }`}
      >
        {/* Avatar placeholder with status dot */}
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-nodes-accent/20 flex items-center justify-center text-nodes-text text-sm font-medium">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-nodes-surface ${statusColor}`}
          />
        </div>

        {/* Name with friend indicator */}
        <span className="text-nodes-text text-sm truncate flex items-center gap-1">
          {displayName}
          {isMe && <span className="text-nodes-text-muted ml-1">(you)</span>}
          {!isMe && isFriend && (
            <svg className="w-3 h-3 text-nodes-accent" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
          )}
        </span>
      </button>

      {/* Context menu */}
      {showMenu && !isMe && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />
          
          {/* Menu - fixed positioned to appear to the left of the member item */}
          <div 
            className="fixed z-20 bg-nodes-surface border border-nodes-border rounded-lg shadow-lg py-1 w-40"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
            {/* Send Message - only for friends */}
            {isFriend && (
              <button
                onClick={handleSendMessage}
                className="w-full px-3 py-2 text-left text-sm text-nodes-text hover:bg-nodes-bg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                Send Message
              </button>
            )}

            {/* Add Friend - only when not a friend and no pending request */}
            {!isFriend && !hasPending && (
              <button
                onClick={handleAddFriend}
                className="w-full px-3 py-2 text-left text-sm text-nodes-text hover:bg-nodes-bg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Add Friend
              </button>
            )}

            {/* Pending indicator */}
            {!isFriend && hasPending && (
              <div className="px-3 py-2 text-sm text-nodes-text-muted flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Request Pending
              </div>
            )}

            {/* Remove Friend - only when a friend */}
            {isFriend && (
              <button
                onClick={handleRemoveFriend}
                className="w-full px-3 py-2 text-left text-sm text-nodes-text hover:bg-nodes-bg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                </svg>
                Remove Friend
              </button>
            )}

            {/* View Profile */}
            {onViewProfile && (
              <button
                onClick={() => {
                  setShowMenu(false);
                  onViewProfile();
                }}
                className="w-full px-3 py-2 text-left text-sm text-nodes-text hover:bg-nodes-bg transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                View Profile
              </button>
            )}

            {/* Divider */}
            <div className="my-1 border-t border-nodes-border" />

            {/* Block User */}
            <button
              onClick={handleBlockUser}
              className="w-full px-3 py-2 text-left text-sm text-red-500 hover:bg-nodes-bg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              Block User
            </button>
          </div>
        </>
      )}
    </div>
  );
}
