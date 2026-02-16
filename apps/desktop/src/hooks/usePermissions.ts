/**
 * usePermissions hook - Easy permission checks for components
 *
 * Provides a convenient way to check if the current user has specific
 * permissions in the active Node and channel context.
 */

import { useMemo } from "react";
import type { RolePermissions } from "@nodes/core";
import { BUILT_IN_ROLE_IDS, createPermissionResolver } from "@nodes/core";
import { useRoleStore } from "../stores/role-store";
import { useNodeStore } from "../stores/node-store";
import { useIdentityStore } from "../stores/identity-store";

// Stable empty array to avoid creating new references
const EMPTY_ROLES: string[] = [];

/**
 * Get the current user's roles in a specific Node
 */
export function useMyRoles(nodeId?: string | null): string[] {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const publicKey = useIdentityStore((s) => s.publicKey);
  const targetNodeId = nodeId ?? activeNodeId;
  
  // Select only the specific node's members, not the entire members object
  const myRoles = useNodeStore((s) => {
    if (!targetNodeId || !publicKey) return EMPTY_ROLES;
    const nodeMembers = s.members[targetNodeId];
    if (!nodeMembers) return EMPTY_ROLES;
    const me = nodeMembers.find((m) => m.publicKey === publicKey);
    return me?.roles || EMPTY_ROLES;
  });

  return myRoles;
}

/**
 * Check if the current user is the owner of a Node
 * Checks both role assignment AND node.owner field (for race condition fallback)
 */
export function useIsOwner(nodeId?: string | null): boolean {
  const myRoles = useMyRoles(nodeId);
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const publicKey = useIdentityStore((s) => s.publicKey);
  const targetNodeId = nodeId ?? activeNodeId;
  
  // Check if owner role is assigned
  const hasOwnerRole = myRoles.includes(BUILT_IN_ROLE_IDS.OWNER);
  
  // Fallback: check if current user is the node's creator
  // This handles the race condition where members haven't loaded yet
  const isNodeCreator = useNodeStore((s) => {
    if (!targetNodeId || !publicKey) return false;
    const node = s.nodes.find((n) => n.id === targetNodeId);
    return node?.owner === publicKey;
  });
  
  return hasOwnerRole || isNodeCreator;
}

/**
 * Check if the current user is an admin (or owner) of a Node
 */
export function useIsAdmin(nodeId?: string | null): boolean {
  const myRoles = useMyRoles(nodeId);
  return (
    myRoles.includes(BUILT_IN_ROLE_IDS.OWNER) ||
    myRoles.includes(BUILT_IN_ROLE_IDS.ADMIN)
  );
}

/**
 * Check if the current user is a moderator (or higher) of a Node
 */
export function useIsModerator(nodeId?: string | null): boolean {
  const myRoles = useMyRoles(nodeId);
  return (
    myRoles.includes(BUILT_IN_ROLE_IDS.OWNER) ||
    myRoles.includes(BUILT_IN_ROLE_IDS.ADMIN) ||
    myRoles.includes(BUILT_IN_ROLE_IDS.MODERATOR)
  );
}

/**
 * Hook to check a specific permission for the current user
 */
export function useHasPermission(
  permission: keyof RolePermissions,
  _channelId?: string  // Channel overrides not yet implemented
): boolean {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const myRoles = useMyRoles();
  const isOwner = useIsOwner();
  
  // Get stable roles array from store
  const nodeRoles = useRoleStore((s) => 
    activeNodeId ? s.rolesByNode[activeNodeId] : undefined
  );
  
  // Compute permission outside selector using useMemo
  return useMemo(() => {
    // Owners have all permissions even if roles haven't loaded
    if (isOwner) return true;
    if (!activeNodeId || !nodeRoles) return false;
    const resolver = createPermissionResolver(nodeRoles);
    return resolver.hasPermission(myRoles, permission, isOwner);
  }, [activeNodeId, nodeRoles, myRoles, permission, isOwner]);
}

/**
 * Hook to get all effective permissions for the current user
 */
export function useMyPermissions(_channelId?: string): RolePermissions | null {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const myRoles = useMyRoles();
  const isOwner = useIsOwner();
  
  // Get stable roles array from store
  const nodeRoles = useRoleStore((s) => 
    activeNodeId ? s.rolesByNode[activeNodeId] : undefined
  );

  // Compute permissions outside selector using useMemo
  return useMemo(() => {
    if (!activeNodeId || !nodeRoles) return null;
    const resolver = createPermissionResolver(nodeRoles);
    return resolver.getEffectivePermissions(myRoles, isOwner);
  }, [activeNodeId, nodeRoles, myRoles, isOwner]);
}

// Stable empty array constant
const EMPTY_NODE_ROLES: import("@nodes/core").Role[] = [];

/**
 * Get all roles for the active Node
 */
export function useNodeRoles(nodeId?: string | null) {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const targetNodeId = nodeId ?? activeNodeId;

  return useRoleStore((s) => {
    if (!targetNodeId) return EMPTY_NODE_ROLES;
    return s.rolesByNode[targetNodeId] || EMPTY_NODE_ROLES;
  });
}

/**
 * Get a specific role by ID
 */
export function useRole(roleId: string, nodeId?: string | null) {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const targetNodeId = nodeId ?? activeNodeId;
  
  // Get stable roles array
  const nodeRoles = useRoleStore((s) => 
    targetNodeId ? s.rolesByNode[targetNodeId] : undefined
  );

  // Find role with useMemo
  return useMemo(() => {
    if (!nodeRoles) return undefined;
    return nodeRoles.find((r) => r.id === roleId);
  }, [nodeRoles, roleId]);
}

/**
 * Get the highest role for a specific user
 */
export function useHighestRole(userRoleIds: string[], nodeId?: string | null) {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const targetNodeId = nodeId ?? activeNodeId;
  
  // Get stable roles array
  const nodeRoles = useRoleStore((s) => 
    targetNodeId ? s.rolesByNode[targetNodeId] : undefined
  );

  // Compute highest role with useMemo
  return useMemo(() => {
    if (!nodeRoles || userRoleIds.length === 0) return undefined;
    const resolver = createPermissionResolver(nodeRoles);
    return resolver.getHighestRole(userRoleIds);
  }, [nodeRoles, userRoleIds]);
}

/**
 * Composite hook that returns common permission checks
 * Useful for components that need multiple permission checks
 */
export function usePermissions(_channelId?: string) {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const publicKey = useIdentityStore((s) => s.publicKey);
  const myRoles = useMyRoles();
  const hasOwnerRole = myRoles.includes(BUILT_IN_ROLE_IDS.OWNER);
  
  // Fallback: check if current user is the node's creator (for race condition)
  const isNodeCreator = useNodeStore((s) => {
    if (!activeNodeId || !publicKey) return false;
    const node = s.nodes.find((n) => n.id === activeNodeId);
    return node?.owner === publicKey;
  });
  
  const isOwner = hasOwnerRole || isNodeCreator;
  const isAdmin = isOwner || myRoles.includes(BUILT_IN_ROLE_IDS.ADMIN);
  const isMod = isAdmin || myRoles.includes(BUILT_IN_ROLE_IDS.MODERATOR);

  // Get stable roles array from store
  const nodeRoles = useRoleStore((s) => 
    activeNodeId ? s.rolesByNode[activeNodeId] : undefined
  );

  // Compute permissions with useMemo instead of inside selector
  const permissions = useMemo(() => {
    if (!activeNodeId || !nodeRoles) return null;
    const resolver = createPermissionResolver(nodeRoles);
    return resolver.getEffectivePermissions(myRoles, isOwner);
  }, [activeNodeId, nodeRoles, myRoles, isOwner]);

  return {
    myRoles,
    isOwner,
    isAdmin,
    isModerator: isMod,
    permissions,
    // Common permission shortcuts - owners get all permissions even if roles haven't loaded
    canManageNode: permissions?.manageNode ?? isOwner,
    canManageChannels: permissions?.manageChannels ?? isOwner,
    canEditChannelSettings: permissions?.editChannelSettings ?? isOwner,
    canManageRoles: permissions?.manageRoles ?? isOwner,
    canAssignRoles: permissions?.assignRoles ?? isOwner,
    canSendMessages: permissions?.sendMessages ?? true,
    canSendFiles: permissions?.sendFiles ?? true,
    canDeleteAnyMessage: permissions?.deleteAnyMessage ?? isOwner,
    canKickMembers: permissions?.kickMembers ?? isOwner,
    canBanMembers: permissions?.banMembers ?? isOwner,
    canManageInvites: permissions?.manageInvites ?? isOwner,
    canViewAuditLog: permissions?.viewAuditLog ?? isOwner,
    // Voice permissions
    canConnectVoice: permissions?.connectVoice ?? true,
    canMuteMembers: permissions?.muteMembers ?? isOwner,
    canMoveMembers: permissions?.moveMembers ?? isOwner,
    canDisconnectMembers: permissions?.disconnectMembers ?? isOwner,
  };
}

/**
 * Check if the current user can modify another member
 * (Based on role hierarchy)
 */
export function useCanModifyMember(targetRoleIds: string[], nodeId?: string | null): boolean {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const targetNodeId = nodeId ?? activeNodeId;
  const myRoles = useMyRoles(targetNodeId);
  const isOwner = useIsOwner(targetNodeId);
  
  // Get stable roles array
  const nodeRoles = useRoleStore((s) => 
    targetNodeId ? s.rolesByNode[targetNodeId] : undefined
  );

  // Compute with useMemo
  return useMemo(() => {
    // Owners can modify anyone
    if (isOwner) return true;
    if (!targetNodeId || !nodeRoles) return false;
    const resolver = createPermissionResolver(nodeRoles);
    return resolver.canModify(myRoles, targetRoleIds);
  }, [targetNodeId, nodeRoles, myRoles, targetRoleIds, isOwner]);
}

/**
 * Check if the current user can assign a specific role
 */
export function useCanAssignRole(roleId: string, nodeId?: string | null): boolean {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const targetNodeId = nodeId ?? activeNodeId;
  const myRoles = useMyRoles(targetNodeId);
  const canAssign = useHasPermission("assignRoles");
  
  // Get stable roles array
  const nodeRoles = useRoleStore((s) => 
    targetNodeId ? s.rolesByNode[targetNodeId] : undefined
  );

  // Compute with useMemo
  return useMemo(() => {
    if (!targetNodeId || !nodeRoles || !canAssign) return false;
    const resolver = createPermissionResolver(nodeRoles);
    return resolver.canAssignRole(myRoles, roleId);
  }, [targetNodeId, nodeRoles, canAssign, myRoles, roleId]);
}

/**
 * Get the role color for a member based on their highest role.
 * Looks up the member's roles array and returns the color of their highest role.
 */
export function useMemberRoleColor(publicKey: string, nodeId?: string | null): string | undefined {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const targetNodeId = nodeId ?? activeNodeId;
  
  // Get the member's roles array from the node store (stable reference)
  const memberRoles = useNodeStore((s) => {
    if (!targetNodeId) return undefined;
    const members = s.members[targetNodeId];
    if (!members) return undefined;
    const member = members.find((m) => m.publicKey === publicKey);
    return member?.roles;
  });
  
  // Get stable roles array
  const nodeRoles = useRoleStore((s) => 
    targetNodeId ? s.rolesByNode[targetNodeId] : undefined
  );
  
  // Compute highest role color with useMemo
  return useMemo(() => {
    if (!targetNodeId || !nodeRoles || !memberRoles || memberRoles.length === 0) {
      return undefined;
    }
    const resolver = createPermissionResolver(nodeRoles);
    const highestRole = resolver.getHighestRole(memberRoles);
    return highestRole?.color;
  }, [targetNodeId, nodeRoles, memberRoles]);
}
