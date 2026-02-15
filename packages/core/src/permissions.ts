/**
 * PermissionResolver - Computes effective permissions for users in a Node
 *
 * Resolution order:
 * 1. Owner always has all permissions (bypass)
 * 2. Channel deny overrides → block
 * 3. Channel allow overrides → grant
 * 4. Base role permissions (union of all roles) → grant/block
 * 5. Implicit member role fallback
 */

import type { Role, RolePermissions, ChannelPermissionOverride, OverrideState } from "./index";
import { BUILT_IN_ROLE_IDS } from "./index";

export class PermissionResolver {
  private roles: Map<string, Role>;
  private channelOverrides: Map<string, Map<string, OverrideState>>;

  constructor(
    roles: Role[],
    channelOverrides?: ChannelPermissionOverride[]
  ) {
    this.roles = new Map(roles.map(r => [r.id, r]));
    this.channelOverrides = new Map();

    if (channelOverrides) {
      for (const override of channelOverrides) {
        const overrideMap = new Map<string, OverrideState>();
        for (const [key, value] of Object.entries(override.overrides)) {
          if (value) overrideMap.set(key, value);
        }
        this.channelOverrides.set(override.roleId, overrideMap);
      }
    }
  }

  /**
   * Check if a user has a specific permission.
   */
  hasPermission(
    userRoleIds: string[],
    permission: keyof RolePermissions,
    isOwner: boolean
  ): boolean {
    // Owner bypass - always has all permissions
    if (isOwner) return true;

    // Check channel overrides first (deny wins over everything)
    let hasAllow = false;
    for (const roleId of userRoleIds) {
      const overrides = this.channelOverrides.get(roleId);
      if (overrides) {
        const state = overrides.get(permission);
        if (state === "deny") return false;
        if (state === "allow") hasAllow = true;
      }
    }
    if (hasAllow) return true;

    // Check base role permissions (union - any role granting = granted)
    for (const roleId of userRoleIds) {
      const role = this.roles.get(roleId);
      if (role?.permissions[permission]) return true;
    }

    // Implicit member role check (everyone has member permissions by default)
    const memberRole = this.roles.get(BUILT_IN_ROLE_IDS.MEMBER);
    if (memberRole?.permissions[permission]) return true;

    return false;
  }

  /**
   * Check if actorRoles can modify targetRoles (hierarchy enforcement).
   * Returns true if the actor's highest role outranks the target's highest role.
   */
  canModify(actorRoleIds: string[], targetRoleIds: string[]): boolean {
    const actorHighest = this.getHighestPosition(actorRoleIds);
    const targetHighest = this.getHighestPosition(targetRoleIds);
    // Lower position number = higher rank
    return actorHighest < targetHighest;
  }

  /**
   * Check if a role can be assigned by the actor.
   * Actor can only assign roles with a position lower than their own highest.
   */
  canAssignRole(actorRoleIds: string[], roleIdToAssign: string): boolean {
    // Can't assign owner role
    if (roleIdToAssign === BUILT_IN_ROLE_IDS.OWNER) return false;

    const actorHighest = this.getHighestPosition(actorRoleIds);
    const role = this.roles.get(roleIdToAssign);
    if (!role) return false;

    // Actor's highest role must outrank the role being assigned
    return actorHighest < role.position;
  }

  /**
   * Check if the actor can remove a role from a target.
   */
  canRemoveRole(actorRoleIds: string[], targetRoleIds: string[], roleIdToRemove: string): boolean {
    // Can't remove owner role
    if (roleIdToRemove === BUILT_IN_ROLE_IDS.OWNER) return false;

    // Must be able to modify the target
    if (!this.canModify(actorRoleIds, targetRoleIds)) return false;

    // Must be able to assign the role (same hierarchy check)
    return this.canAssignRole(actorRoleIds, roleIdToRemove);
  }

  /**
   * Get the highest-ranked position from a list of role IDs.
   * (Lowest number = highest rank)
   */
  private getHighestPosition(roleIds: string[]): number {
    let highest = Infinity;
    for (const roleId of roleIds) {
      const role = this.roles.get(roleId);
      if (role && role.position < highest) {
        highest = role.position;
      }
    }
    // If no explicit roles, use member position
    if (highest === Infinity) {
      const member = this.roles.get(BUILT_IN_ROLE_IDS.MEMBER);
      return member?.position ?? 999;
    }
    return highest;
  }

  /**
   * Get all permissions for a user (useful for UI: show/hide elements).
   */
  getEffectivePermissions(
    userRoleIds: string[],
    isOwner: boolean
  ): RolePermissions {
    // Get permission keys from a known role
    const keys: (keyof RolePermissions)[] = [
      "manageNode", "manageChannels", "editChannelSettings",
      "manageRoles", "assignRoles",
      "sendMessages", "sendFiles", "useReactions", "embedLinks",
      "editOwnMessages", "deleteOwnMessages", "deleteAnyMessage",
      "kickMembers", "banMembers", "manageInvites", "viewAuditLog",
      "connectVoice", "muteMembers", "moveMembers", "disconnectMembers"
    ];

    const perms = {} as RolePermissions;
    for (const key of keys) {
      perms[key] = this.hasPermission(userRoleIds, key, isOwner);
    }
    return perms;
  }

  /**
   * Get a role by ID.
   */
  getRole(roleId: string): Role | undefined {
    return this.roles.get(roleId);
  }

  /**
   * Get all roles sorted by position (highest rank first).
   */
  getAllRoles(): Role[] {
    return Array.from(this.roles.values()).sort((a, b) => a.position - b.position);
  }

  /**
   * Get the highest role a user has.
   */
  getHighestRole(userRoleIds: string[]): Role | undefined {
    let highest: Role | undefined;
    let highestPosition = Infinity;

    for (const roleId of userRoleIds) {
      const role = this.roles.get(roleId);
      if (role && role.position < highestPosition) {
        highest = role;
        highestPosition = role.position;
      }
    }

    return highest;
  }

  /**
   * Check if a user is the owner.
   */
  isOwner(userRoleIds: string[]): boolean {
    return userRoleIds.includes(BUILT_IN_ROLE_IDS.OWNER);
  }

  /**
   * Check if a user has admin-level permissions (Owner or Admin role).
   */
  isAdmin(userRoleIds: string[]): boolean {
    return (
      userRoleIds.includes(BUILT_IN_ROLE_IDS.OWNER) ||
      userRoleIds.includes(BUILT_IN_ROLE_IDS.ADMIN)
    );
  }

  /**
   * Check if a user is a moderator or higher.
   */
  isModerator(userRoleIds: string[]): boolean {
    return (
      userRoleIds.includes(BUILT_IN_ROLE_IDS.OWNER) ||
      userRoleIds.includes(BUILT_IN_ROLE_IDS.ADMIN) ||
      userRoleIds.includes(BUILT_IN_ROLE_IDS.MODERATOR)
    );
  }
}

/**
 * Create a permission resolver for a Node.
 * Convenience factory function.
 */
export function createPermissionResolver(
  roles: Role[],
  channelOverrides?: ChannelPermissionOverride[]
): PermissionResolver {
  return new PermissionResolver(roles, channelOverrides);
}
