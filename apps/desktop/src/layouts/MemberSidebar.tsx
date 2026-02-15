import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useNodeStore } from "../stores/node-store";
import { useDMStore } from "../stores/dm-store";
import { useSocialStore } from "../stores/social-store";
import { useIdentityStore } from "../stores/identity-store";
import { useNavigationStore } from "../stores/navigation-store";
import { useNodeRoles, usePermissions, useMyRoles } from "../hooks/usePermissions";
import { useRoleStore } from "../stores/role-store";
import { ProfileManager, roleManager } from "@nodes/transport-gun";
import { MemberListSkeleton, NameSkeleton } from "../components/ui";
import type { NodeMember, Role } from "@nodes/core";
import type { KeyPair } from "@nodes/crypto";
import { BUILT_IN_ROLE_IDS } from "@nodes/core";

const profileManager = new ProfileManager();

// TTL for cached names (5 minutes)
const NAME_CACHE_TTL = 5 * 60 * 1000;

/**
 * MemberSidebar displays the member list for the active Node.
 * Members are grouped by their highest role with presence dots.
 */
export function MemberSidebar({ onUserClick }: { onUserClick?: (userId: string) => void }) {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const members = useNodeStore((s) => s.members);
  const roles = useNodeRoles();
  const nodeMembers = useMemo(
    () => (activeNodeId ? members[activeNodeId] || [] : []),
    [activeNodeId, members]
  );
  const isMembersLoading = activeNodeId ? members[activeNodeId] === undefined : false;
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});
  const resolvedNamesRef = useRef<Record<string, string>>({});
  const lastRefreshRef = useRef<number>(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // DM functionality
  const startConversation = useDMStore((s) => s.startConversation);
  const setActiveConversation = useDMStore((s) => s.setActiveConversation);
  const keypair = useIdentityStore((s) => s.keypair);
  const myPublicKey = useIdentityStore((s) => s.publicKey);
  const myProfile = useIdentityStore((s) => s.profile);
  const profileVersion = useIdentityStore((s) => s.profileVersion);
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

  // Force refresh all names (clears cache and re-fetches)
  const refreshNames = useCallback(async () => {
    if (isRefreshing || nodeMembers.length === 0) return;
    
    setIsRefreshing(true);
    const names: Record<string, string> = {};
    
    for (const member of nodeMembers) {
      try {
        const profile = await profileManager.getPublicProfile(member.publicKey);
        names[member.publicKey] = profile?.displayName || member.publicKey.slice(0, 8);
      } catch {
        names[member.publicKey] = member.publicKey.slice(0, 8);
      }
    }
    
    resolvedNamesRef.current = names;
    setResolvedNames(names);
    lastRefreshRef.current = Date.now();
    setIsRefreshing(false);
  }, [nodeMembers, isRefreshing]);

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

  // Update cached name when own profile changes
  useEffect(() => {
    if (myPublicKey && myProfile?.data.displayName) {
      const newName = myProfile.data.displayName;
      if (resolvedNamesRef.current[myPublicKey] !== newName) {
        resolvedNamesRef.current = { ...resolvedNamesRef.current, [myPublicKey]: newName };
        setResolvedNames(resolvedNamesRef.current);
      }
    }
  }, [myPublicKey, myProfile?.data.displayName, profileVersion]);

  // TTL auto-refresh (every 5 minutes)
  useEffect(() => {
    const interval = setInterval(() => {
      const timeSinceLastRefresh = Date.now() - lastRefreshRef.current;
      if (timeSinceLastRefresh >= NAME_CACHE_TTL && nodeMembers.length > 0) {
        refreshNames();
      }
    }, 60 * 1000); // Check every minute
    
    return () => clearInterval(interval);
  }, [refreshNames, nodeMembers.length]);

  if (!activeNodeId) {
    return null;
  }

  // Helper to check if member is online (online, idle, dnd count as online)
  const isOnline = (member: NodeMember) => 
    member.status === "online" || member.status === "idle" || member.status === "dnd";

  // Helper to get member's highest role
  const getHighestRole = (member: NodeMember): Role | undefined => {
    const memberRoles = member.roles || [];
    let highest: Role | undefined;
    for (const roleId of memberRoles) {
      const role = roles.find((r) => r.id === roleId);
      if (role && (!highest || role.position < highest.position)) {
        highest = role;
      }
    }
    // Fall back to Member role if no explicit roles
    if (!highest) {
      highest = roles.find((r) => r.id === BUILT_IN_ROLE_IDS.MEMBER);
    }
    return highest;
  };

  // Group members by their highest role
  const membersByRole: Map<string, { role: Role; members: NodeMember[] }> = new Map();
  
  for (const member of nodeMembers) {
    const highestRole = getHighestRole(member);
    if (!highestRole) continue;
    
    if (!membersByRole.has(highestRole.id)) {
      membersByRole.set(highestRole.id, { role: highestRole, members: [] });
    }
    membersByRole.get(highestRole.id)!.members.push(member);
  }

  // Sort role groups by position (highest rank first)
  const sortedRoleGroups = Array.from(membersByRole.values())
    .sort((a, b) => a.role.position - b.role.position);

  // Split each role group into online/offline
  const onlineGroups = sortedRoleGroups.map(({ role, members }) => ({
    role,
    members: members.filter(isOnline),
  })).filter((g) => g.members.length > 0);

  const offlineMembers = nodeMembers.filter((m) => !isOnline(m));

  return (
    <div className="w-60 bg-depth-secondary border-l border-surface-border flex flex-col shrink-0">
      <div className="p-4 border-b border-surface-border flex items-center justify-between">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">
          Members{!isMembersLoading && ` — ${nodeMembers.length}`}
        </h3>
        <button
          onClick={refreshNames}
          disabled={isRefreshing}
          className="p-1 text-nodes-text-muted hover:text-nodes-text transition-colors disabled:opacity-50"
          title="Refresh member names"
        >
          <svg 
            className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor" 
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {isMembersLoading ? (
          <MemberListSkeleton />
        ) : (
          <>
            {/* Online members grouped by role */}
            {onlineGroups.map(({ role, members: roleMembers }) => (
              <MemberGroup
                key={`online-${role.id}`}
                title={role.name}
                titleColor={role.color}
                members={roleMembers}
                resolvedNames={resolvedNames}
                myPublicKey={myPublicKey}
                onSendMessage={handleSendMessage}
                onAddFriend={handleAddFriend}
                onRemoveFriend={removeFriend}
                onBlockUser={blockUser}
                isFriend={isFriend}
                hasPendingRequest={hasPendingRequest}
                onUserClick={onUserClick}
                roles={roles}
              />
            ))}

            {/* Offline Section */}
            {offlineMembers.length > 0 && (
              <MemberGroup
                title="Offline"
                members={offlineMembers}
                resolvedNames={resolvedNames}
                myPublicKey={myPublicKey}
                onSendMessage={handleSendMessage}
                onAddFriend={handleAddFriend}
                onRemoveFriend={removeFriend}
                onBlockUser={blockUser}
                isFriend={isFriend}
                hasPendingRequest={hasPendingRequest}
                onUserClick={onUserClick}
                roles={roles}
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
  titleColor?: string;
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
  roles?: Role[];
}

function MemberGroup({ 
  title, 
  titleColor,
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
  roles = [],
}: MemberGroupProps) {
  // Helper to get member's highest role for display color
  const getMemberHighestRole = (member: NodeMember): Role | undefined => {
    const memberRoles = member.roles || [];
    let highest: Role | undefined;
    for (const roleId of memberRoles) {
      const role = roles.find((r) => r.id === roleId);
      if (role && (!highest || role.position < highest.position)) {
        highest = role;
      }
    }
    return highest;
  };

  return (
    <div className="px-2 mb-4">
      <h4 
        className="px-2 text-xs font-semibold uppercase tracking-wide mb-1"
        style={{ color: titleColor || "var(--nodes-text-muted)" }}
      >
        {title} — {members.length}
      </h4>
      {members.map((member) => {
        const memberRole = getMemberHighestRole(member);
        return (
          <MemberItem
            key={member.publicKey}
            publicKey={member.publicKey}
            displayName={resolvedNames[member.publicKey]}
            isNameLoading={!resolvedNames[member.publicKey]}
            status={member.status}
            role={member.role}
            roleColor={memberRole?.color}
            memberRoles={member.roles || []}
            allRoles={roles}
            isMe={member.publicKey === myPublicKey}
            isFriend={isFriend(member.publicKey)}
            hasPending={hasPendingRequest(member.publicKey)}
            onSendMessage={() => onSendMessage(member.publicKey)}
            onAddFriend={() => onAddFriend(member.publicKey)}
            onRemoveFriend={() => onRemoveFriend(member.publicKey)}
            onBlockUser={() => onBlockUser(member.publicKey)}
            onViewProfile={onUserClick ? () => onUserClick(member.publicKey) : undefined}
          />
        );
      })}
    </div>
  );
}

interface MemberItemProps {
  publicKey: string;
  displayName?: string;
  isNameLoading: boolean;
  status?: string;
  role?: "owner" | "admin" | "member";
  roleColor?: string;
  memberRoles: string[];
  allRoles: Role[];
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
  publicKey,
  displayName, 
  isNameLoading,
  status, 
  role,
  roleColor,
  memberRoles,
  allRoles,
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
  const [showRolesSubmenu, setShowRolesSubmenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  
  // Permission checks for role assignment
  const { canAssignRoles } = usePermissions();
  const myRoles = useMyRoles();
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const getResolver = useRoleStore((s) => s.getResolver);
  
  // Determine status color
  const statusColor =
    status === "online"
      ? "bg-nodes-accent"
      : status === "idle"
      ? "bg-yellow-500"
      : status === "dnd"
      ? "bg-red-500"
      : "bg-gray-500";
  
  // Check which roles I can assign to this member
  const assignableRoles = useMemo(() => {
    if (!activeNodeId || !canAssignRoles) return [];
    const resolver = getResolver(activeNodeId);
    
    // Filter roles that I can assign (based on hierarchy)
    return allRoles.filter((r) => {
      // Can't assign Owner role
      if (r.id === BUILT_IN_ROLE_IDS.OWNER) return false;
      // Check if I can assign this role based on my position
      return resolver.canAssignRole(myRoles, r.id);
    }).sort((a, b) => a.position - b.position);
  }, [activeNodeId, canAssignRoles, allRoles, myRoles, getResolver]);
  
  // Handle role toggle
  const handleRoleToggle = async (roleId: string) => {
    if (!activeNodeId) return;
    
    const hasRole = memberRoles.includes(roleId);
    try {
      if (hasRole) {
        await roleManager.removeRole(activeNodeId, publicKey, roleId);
      } else {
        await roleManager.assignRole(activeNodeId, publicKey, roleId);
      }
      // Refresh members to get updated roles
      useNodeStore.getState().loadMembers(activeNodeId);
    } catch (err) {
      console.error("Failed to toggle role:", err);
    }
  };

  const handleClick = () => {
    if (isMe) {
      // For own profile, just open profile view
      onViewProfile?.();
    } else if (buttonRef.current) {
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
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-nodes-bg/50 transition-colors cursor-pointer"
      >
        {/* Avatar placeholder with status dot */}
        <div className="relative">
          <div className="w-8 h-8 rounded-full bg-nodes-accent/20 flex items-center justify-center text-nodes-text text-sm font-medium">
            {isNameLoading ? (
              <div className="w-3 h-3 animate-pulse rounded bg-nodes-border/50" />
            ) : (
              displayName?.charAt(0).toUpperCase() || "?"
            )}
          </div>
          <div
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-nodes-surface ${statusColor}`}
          />
        </div>

        {/* Name with friend indicator */}
        <span className="text-sm truncate flex items-center gap-1">
          {isNameLoading ? (
            <NameSkeleton width="w-20" />
          ) : (
            <>
              {role === "owner" && <span title="Node Owner">👑</span>}
              <span style={{ color: roleColor || 'var(--nodes-text)' }}>{displayName}</span>
              {isMe && <span className="text-nodes-text-muted ml-1">(you)</span>}
              {!isMe && isFriend && (
                <svg className="w-3 h-3 text-nodes-accent" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
            </>
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

            {/* Roles submenu - only show if user can assign roles */}
            {canAssignRoles && assignableRoles.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowRolesSubmenu(!showRolesSubmenu)}
                  className="w-full px-3 py-2 text-left text-sm text-nodes-text hover:bg-nodes-bg transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    Roles
                  </div>
                  <svg 
                    className={`w-3 h-3 transition-transform ${showRolesSubmenu ? 'rotate-90' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor" 
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
                
                {/* Roles submenu content */}
                {showRolesSubmenu && (
                  <div className="border-t border-nodes-border bg-nodes-bg/50">
                    {assignableRoles.map((r) => {
                      const hasRole = memberRoles.includes(r.id);
                      return (
                        <button
                          key={r.id}
                          onClick={() => handleRoleToggle(r.id)}
                          className="w-full px-4 py-1.5 text-left text-sm text-nodes-text hover:bg-nodes-bg transition-colors flex items-center gap-2"
                        >
                          {/* Checkbox */}
                          <div 
                            className={`w-4 h-4 rounded border flex items-center justify-center ${
                              hasRole 
                                ? 'bg-nodes-accent border-nodes-accent' 
                                : 'border-nodes-border'
                            }`}
                          >
                            {hasRole && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          {/* Role color dot */}
                          {r.color && (
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: r.color }}
                            />
                          )}
                          <span>{r.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
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
