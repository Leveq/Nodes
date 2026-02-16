/**
 * Role Store - Manages roles and permissions state for Nodes
 */

import { create } from "zustand";
import type { Role, RolePermissions, ChannelPermissionOverride } from "@nodes/core";
import { BUILT_IN_ROLE_IDS, createDefaultRoles, createPermissionResolver } from "@nodes/core";
import type { PermissionResolver } from "@nodes/core";

// Stable default values to avoid creating new references on every access
const DEFAULT_ROLES: Role[] = createDefaultRoles("_default_");

interface RoleState {
  // Roles by Node ID
  rolesByNode: Record<string, Role[]>;
  
  // Channel overrides by Node ID -> Channel ID
  channelOverridesByNode: Record<string, Record<string, ChannelPermissionOverride[]>>;
  
  // Cached permission resolvers by Node ID
  resolvers: Record<string, PermissionResolver>;
  
  // Loading state
  loadingNodes: Set<string>;
}

interface RoleActions {
  // Set roles for a node
  setRoles: (nodeId: string, roles: Role[]) => void;
  
  // Add or update a single role (for optimistic updates)
  upsertRole: (nodeId: string, role: Role) => void;
  
  // Remove a role by ID
  removeRole: (nodeId: string, roleId: string) => void;
  
  // Set channel overrides for a specific channel
  setChannelOverrides: (nodeId: string, channelId: string, overrides: ChannelPermissionOverride[]) => void;
  
  // Get the permission resolver for a node (with optional channel context)
  getResolver: (nodeId: string, channelId?: string) => PermissionResolver;
  
  // Check a specific permission for a user
  hasPermission: (
    nodeId: string,
    userRoleIds: string[],
    permission: keyof RolePermissions,
    isOwner: boolean,
    channelId?: string
  ) => boolean;
  
  // Get effective permissions for a user
  getEffectivePermissions: (
    nodeId: string,
    userRoleIds: string[],
    isOwner: boolean,
    channelId?: string
  ) => RolePermissions;
  
  // Get all roles for a node
  getRoles: (nodeId: string) => Role[];
  
  // Get a specific role
  getRole: (nodeId: string, roleId: string) => Role | undefined;
  
  // Get highest role for a user
  getHighestRole: (nodeId: string, userRoleIds: string[]) => Role | undefined;
  
  // Check if user is owner
  isOwner: (userRoleIds: string[]) => boolean;
  
  // Check if user is admin or higher
  isAdmin: (userRoleIds: string[]) => boolean;
  
  // Check if user is moderator or higher
  isModerator: (userRoleIds: string[]) => boolean;
  
  // Set loading state
  setLoading: (nodeId: string, loading: boolean) => void;
  
  // Clear roles for a node (on leave/logout)
  clearNode: (nodeId: string) => void;
}

export const useRoleStore = create<RoleState & RoleActions>((set, get) => ({
  rolesByNode: {},
  channelOverridesByNode: {},
  resolvers: {},
  loadingNodes: new Set(),

  setRoles: (nodeId, roles) => {
    set((state) => {
      const newRolesByNode = { ...state.rolesByNode, [nodeId]: roles };
      
      // Invalidate cached resolver for this node
      const newResolvers = { ...state.resolvers };
      delete newResolvers[nodeId];
      
      return { rolesByNode: newRolesByNode, resolvers: newResolvers };
    });
  },

  upsertRole: (nodeId, role) => {
    set((state) => {
      const existingRoles = state.rolesByNode[nodeId] || [];
      const roleIndex = existingRoles.findIndex(r => r.id === role.id);
      
      let newRoles: Role[];
      if (roleIndex >= 0) {
        // Update existing role
        newRoles = [...existingRoles];
        newRoles[roleIndex] = role;
      } else {
        // Add new role
        newRoles = [...existingRoles, role];
      }
      
      const newRolesByNode = { ...state.rolesByNode, [nodeId]: newRoles };
      
      // Invalidate cached resolver for this node
      const newResolvers = { ...state.resolvers };
      delete newResolvers[nodeId];
      
      return { rolesByNode: newRolesByNode, resolvers: newResolvers };
    });
  },

  removeRole: (nodeId, roleId) => {
    set((state) => {
      const existingRoles = state.rolesByNode[nodeId] || [];
      const newRoles = existingRoles.filter(r => r.id !== roleId);
      
      const newRolesByNode = { ...state.rolesByNode, [nodeId]: newRoles };
      
      // Invalidate cached resolver for this node
      const newResolvers = { ...state.resolvers };
      delete newResolvers[nodeId];
      
      return { rolesByNode: newRolesByNode, resolvers: newResolvers };
    });
  },

  setChannelOverrides: (nodeId, channelId, overrides) => {
    set((state) => {
      const nodeOverrides = state.channelOverridesByNode[nodeId] || {};
      const newNodeOverrides = { ...nodeOverrides, [channelId]: overrides };
      
      // Invalidate cached resolver for this node
      const newResolvers = { ...state.resolvers };
      delete newResolvers[nodeId];
      
      return {
        channelOverridesByNode: {
          ...state.channelOverridesByNode,
          [nodeId]: newNodeOverrides,
        },
        resolvers: newResolvers,
      };
    });
  },

  getResolver: (nodeId, channelId) => {
    const state = get();
    
    // Check cache first (for node-level resolver without channel context)
    if (!channelId && state.resolvers[nodeId]) {
      return state.resolvers[nodeId];
    }
    
    // Get roles (or use defaults if not loaded)
    const roles = state.rolesByNode[nodeId] || DEFAULT_ROLES;
    
    // Get channel overrides if specified
    let channelOverrides: ChannelPermissionOverride[] | undefined;
    if (channelId) {
      channelOverrides = state.channelOverridesByNode[nodeId]?.[channelId];
    }
    
    // Create resolver
    const resolver = createPermissionResolver(roles, channelOverrides);
    
    // DON'T cache during render - it causes infinite loops
    // Resolvers are lightweight to create and caching happens via setRoles
    
    return resolver;
  },

  hasPermission: (nodeId, userRoleIds, permission, isOwner, channelId) => {
    const resolver = get().getResolver(nodeId, channelId);
    return resolver.hasPermission(userRoleIds, permission, isOwner);
  },

  getEffectivePermissions: (nodeId, userRoleIds, isOwner, channelId) => {
    const resolver = get().getResolver(nodeId, channelId);
    return resolver.getEffectivePermissions(userRoleIds, isOwner);
  },

  getRoles: (nodeId) => {
    const state = get();
    return state.rolesByNode[nodeId] || DEFAULT_ROLES;
  },

  getRole: (nodeId, roleId) => {
    const roles = get().getRoles(nodeId);
    return roles.find((r) => r.id === roleId);
  },

  getHighestRole: (nodeId, userRoleIds) => {
    const resolver = get().getResolver(nodeId);
    return resolver.getHighestRole(userRoleIds);
  },

  isOwner: (userRoleIds) => {
    return userRoleIds.includes(BUILT_IN_ROLE_IDS.OWNER);
  },

  isAdmin: (userRoleIds) => {
    return (
      userRoleIds.includes(BUILT_IN_ROLE_IDS.OWNER) ||
      userRoleIds.includes(BUILT_IN_ROLE_IDS.ADMIN)
    );
  },

  isModerator: (userRoleIds) => {
    return (
      userRoleIds.includes(BUILT_IN_ROLE_IDS.OWNER) ||
      userRoleIds.includes(BUILT_IN_ROLE_IDS.ADMIN) ||
      userRoleIds.includes(BUILT_IN_ROLE_IDS.MODERATOR)
    );
  },

  setLoading: (nodeId, loading) => {
    set((state) => {
      const newLoading = new Set(state.loadingNodes);
      if (loading) {
        newLoading.add(nodeId);
      } else {
        newLoading.delete(nodeId);
      }
      return { loadingNodes: newLoading };
    });
  },

  clearNode: (nodeId) => {
    set((state) => {
      const newRolesByNode = { ...state.rolesByNode };
      delete newRolesByNode[nodeId];
      
      const newOverrides = { ...state.channelOverridesByNode };
      delete newOverrides[nodeId];
      
      const newResolvers = { ...state.resolvers };
      delete newResolvers[nodeId];
      
      return {
        rolesByNode: newRolesByNode,
        channelOverridesByNode: newOverrides,
        resolvers: newResolvers,
      };
    });
  },
}));

// Selector hooks for common permission checks
export const useHasPermission = (
  nodeId: string | null,
  userRoleIds: string[],
  permission: keyof RolePermissions,
  isOwner: boolean,
  channelId?: string
): boolean => {
  return useRoleStore((state) => {
    if (!nodeId) return false;
    return state.hasPermission(nodeId, userRoleIds, permission, isOwner, channelId);
  });
};

export const useIsAdmin = (userRoleIds: string[]): boolean => {
  return useRoleStore((state) => state.isAdmin(userRoleIds));
};

export const useIsModerator = (userRoleIds: string[]): boolean => {
  return useRoleStore((state) => state.isModerator(userRoleIds));
};
