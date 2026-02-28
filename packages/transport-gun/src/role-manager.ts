/**
 * RoleManager - Handles CRUD for roles and role assignments in Nodes
 *
 * Role data is stored in the Gun graph:
 * - gun.get("nodes").get(nodeId).get("roles").get(roleId) → Role data
 * - gun.get("nodes").get(nodeId).get("members").get(publicKey).get("roles") → JSON array of role IDs
 */

import { GunInstanceManager } from "./gun-instance";
import type { Role, RolePermissions, ChannelPermissionOverride } from "@nodes/core";
import { BUILT_IN_ROLE_IDS, createDefaultRoles, DEFAULT_PERMISSIONS } from "@nodes/core";

export class RoleManager {
  /**
   * Initialize built-in roles for a newly created Node.
   * Called from NodeManager.createNode().
   */
  async initializeRoles(nodeId: string, creatorPublicKey: string): Promise<void> {
    const gun = GunInstanceManager.get();
    const roles = createDefaultRoles(creatorPublicKey);

    for (const role of roles) {
      await new Promise<void>((resolve) => {
        gun.get("nodes").get(nodeId).get("roles").get(role.id).put(
          {
            id: role.id,
            name: role.name,
            color: role.color,
            position: role.position,
            permissions: JSON.stringify(role.permissions),
            isBuiltIn: role.isBuiltIn,
            createdAt: role.createdAt,
            createdBy: role.createdBy,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (ack: any) => {
            if (ack.err) {
              console.error(`Failed to create role ${role.id}:`, ack.err);
            }
            resolve();
          }
        );
      });
    }
  }

  /**
   * Get all roles for a Node.
   */
  async getRoles(nodeId: string): Promise<Role[]> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      const roles: Role[] = [];
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // If no roles found, return default built-in roles
          if (roles.length === 0) {
            resolve(createDefaultRoles("system"));
          } else {
            resolve(roles.sort((a, b) => a.position - b.position));
          }
        }
      }, 5000); // Increased timeout for slower connections

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gun.get("nodes").get(nodeId).get("roles").map().once((data: any) => {
        if (!data || !data.id) return;

        let permissions: RolePermissions;
        try {
          const parsed = typeof data.permissions === "string"
            ? JSON.parse(data.permissions)
            : data.permissions;
          // Backfill any permission fields added after this role was stored in Gun
          const builtInId = data.id as keyof typeof DEFAULT_PERMISSIONS;
          const defaults = DEFAULT_PERMISSIONS[builtInId] ?? DEFAULT_PERMISSIONS[BUILT_IN_ROLE_IDS.MEMBER];
          permissions = { ...defaults, ...parsed };
        } catch {
          // Fallback to default permissions for this role type
          const builtInId = data.id as keyof typeof DEFAULT_PERMISSIONS;
          permissions = DEFAULT_PERMISSIONS[builtInId] || DEFAULT_PERMISSIONS[BUILT_IN_ROLE_IDS.MEMBER];
        }

        roles.push({
          id: data.id,
          name: data.name || "Unknown",
          color: data.color || "#95A5A6",
          position: data.position ?? 100,
          permissions,
          isBuiltIn: data.isBuiltIn ?? false,
          createdAt: data.createdAt || Date.now(),
          createdBy: data.createdBy || "",
        });
      });

      // Resolve earlier if we have roles
      setTimeout(() => {
        if (!resolved && roles.length > 0) {
          clearTimeout(timeout);
          resolved = true;
          resolve(roles.sort((a, b) => a.position - b.position));
        }
      }, 2000);
    });
  }

  /**
   * Get a single role by ID.
   */
  async getRole(nodeId: string, roleId: string): Promise<Role | null> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gun.get("nodes").get(nodeId).get("roles").get(roleId).once((data: any) => {
        if (!data || !data.id) {
          resolve(null);
          return;
        }

        let permissions: RolePermissions;
        try {
          const parsed = typeof data.permissions === "string"
            ? JSON.parse(data.permissions)
            : data.permissions;
          // Backfill any permission fields added after this role was stored in Gun
          const builtInId = data.id as keyof typeof DEFAULT_PERMISSIONS;
          const defaults = DEFAULT_PERMISSIONS[builtInId] ?? DEFAULT_PERMISSIONS[BUILT_IN_ROLE_IDS.MEMBER];
          permissions = { ...defaults, ...parsed };
        } catch {
          const builtInId = data.id as keyof typeof DEFAULT_PERMISSIONS;
          permissions = DEFAULT_PERMISSIONS[builtInId] || DEFAULT_PERMISSIONS[BUILT_IN_ROLE_IDS.MEMBER];
        }

        resolve({
          id: data.id,
          name: data.name || "Unknown",
          color: data.color || "#95A5A6",
          position: data.position ?? 100,
          permissions,
          isBuiltIn: data.isBuiltIn ?? false,
          createdAt: data.createdAt || Date.now(),
          createdBy: data.createdBy || "",
        });
      });
    });
  }

  /**
   * Create a custom role.
   */
  async createRole(
    nodeId: string,
    name: string,
    color: string,
    position: number,
    permissions: RolePermissions,
    creatorPublicKey: string
  ): Promise<Role> {
    const gun = GunInstanceManager.get();

    const roleId = `role_${generateRoleId()}`;
    const now = Date.now();

    const role: Role = {
      id: roleId,
      name,
      color,
      position,
      permissions,
      isBuiltIn: false,
      createdAt: now,
      createdBy: creatorPublicKey,
    };

    return new Promise((resolve, reject) => {
      gun.get("nodes").get(nodeId).get("roles").get(roleId).put(
        {
          id: role.id,
          name: role.name,
          color: role.color,
          position: role.position,
          permissions: JSON.stringify(role.permissions),
          isBuiltIn: false,
          createdAt: role.createdAt,
          createdBy: role.createdBy,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ack: any) => {
          if (ack.err) {
            reject(new Error(`Failed to create role: ${ack.err}`));
            return;
          }
          resolve(role);
        }
      );
    });
  }

  /**
   * Update a role's properties.
   */
  async updateRole(
    nodeId: string,
    roleId: string,
    updates: Partial<Pick<Role, "name" | "color" | "position" | "permissions">>
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    // Can't update built-in role IDs
    if (Object.values(BUILT_IN_ROLE_IDS).includes(roleId as typeof BUILT_IN_ROLE_IDS[keyof typeof BUILT_IN_ROLE_IDS])) {
      // Built-in roles can only have name and color updated (not permissions)
      if (updates.permissions) {
        throw new Error("Cannot modify permissions of built-in roles");
      }
    }

    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.color !== undefined) updateData.color = updates.color;
    if (updates.position !== undefined) updateData.position = updates.position;
    if (updates.permissions !== undefined) {
      updateData.permissions = JSON.stringify(updates.permissions);
    }

    return new Promise((resolve, reject) => {
      gun.get("nodes").get(nodeId).get("roles").get(roleId).put(
        updateData,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ack: any) => {
          if (ack.err) {
            reject(new Error(`Failed to update role: ${ack.err}`));
            return;
          }
          resolve();
        }
      );
    });
  }

  /**
   * Delete a custom role.
   * Built-in roles cannot be deleted.
   */
  async deleteRole(nodeId: string, roleId: string): Promise<void> {
    // Prevent deleting built-in roles
    if (Object.values(BUILT_IN_ROLE_IDS).includes(roleId as typeof BUILT_IN_ROLE_IDS[keyof typeof BUILT_IN_ROLE_IDS])) {
      throw new Error("Cannot delete built-in roles");
    }

    const gun = GunInstanceManager.get();

    // First, remove this role from all members who have it
    // (In a real implementation, you'd iterate members and update their roles)

    return new Promise((resolve, reject) => {
      gun.get("nodes").get(nodeId).get("roles").get(roleId).put(
        null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ack: any) => {
          if (ack.err) {
            reject(new Error(`Failed to delete role: ${ack.err}`));
            return;
          }
          resolve();
        }
      );
    });
  }

  // ── Member Role Assignment ──

  /**
   * Get a member's assigned roles.
   */
  async getMemberRoles(nodeId: string, publicKey: string): Promise<string[]> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      gun.get("nodes").get(nodeId).get("members").get(publicKey).once(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data: any) => {
          if (!data) {
            resolve([]);
            return;
          }

          // Support both old format (single role string) and new format (roles array)
          if (data.roles) {
            try {
              const roles = typeof data.roles === "string" ? JSON.parse(data.roles) : data.roles;
              resolve(Array.isArray(roles) ? roles : []);
            } catch {
              resolve([]);
            }
          } else if (data.role) {
            // Legacy: convert single role to array format
            const legacyRole = data.role as string;
            if (legacyRole === "owner") {
              resolve([BUILT_IN_ROLE_IDS.OWNER]);
            } else if (legacyRole === "admin") {
              resolve([BUILT_IN_ROLE_IDS.ADMIN]);
            } else {
              resolve([]);  // Member is implicit
            }
          } else {
            resolve([]);
          }
        }
      );
    });
  }

  /**
   * Assign a role to a member.
   */
  async assignRole(nodeId: string, publicKey: string, roleId: string): Promise<void> {
    // Can't assign Owner role through this method
    if (roleId === BUILT_IN_ROLE_IDS.OWNER) {
      throw new Error("Owner role cannot be assigned");
    }

    const currentRoles = await this.getMemberRoles(nodeId, publicKey);

    // Don't add duplicate roles
    if (currentRoles.includes(roleId)) {
      return;
    }

    const newRoles = [...currentRoles, roleId];
    await this.setMemberRoles(nodeId, publicKey, newRoles);
  }

  /**
   * Remove a role from a member.
   */
  async removeRole(nodeId: string, publicKey: string, roleId: string): Promise<void> {
    // Can't remove Owner role through this method
    if (roleId === BUILT_IN_ROLE_IDS.OWNER) {
      throw new Error("Owner role cannot be removed");
    }

    const currentRoles = await this.getMemberRoles(nodeId, publicKey);
    const newRoles = currentRoles.filter(r => r !== roleId);
    await this.setMemberRoles(nodeId, publicKey, newRoles);
  }

  /**
   * Set all roles for a member (replaces existing roles).
   */
  async setMemberRoles(nodeId: string, publicKey: string, roleIds: string[]): Promise<void> {
    const gun = GunInstanceManager.get();

    // Derive legacy role field for backwards compatibility
    let legacyRole: "owner" | "admin" | "member" = "member";
    if (roleIds.includes(BUILT_IN_ROLE_IDS.OWNER)) {
      legacyRole = "owner";
    } else if (roleIds.includes(BUILT_IN_ROLE_IDS.ADMIN)) {
      legacyRole = "admin";
    }

    return new Promise((resolve, reject) => {
      gun.get("nodes").get(nodeId).get("members").get(publicKey).put(
        {
          roles: JSON.stringify(roleIds),
          role: legacyRole,  // Keep legacy field for backwards compat
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ack: any) => {
          if (ack.err) {
            reject(new Error(`Failed to set member roles: ${ack.err}`));
            return;
          }
          resolve();
        }
      );
    });
  }

  // ── Channel Permission Overrides ──

  /**
   * Get permission overrides for a channel.
   */
  async getChannelOverrides(nodeId: string, channelId: string): Promise<ChannelPermissionOverride[]> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      const overrides: ChannelPermissionOverride[] = [];
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(overrides);
        }
      }, 2000);

      gun.get("nodes").get(nodeId).get("channels").get(channelId)
        .get("permissionOverrides").map().once(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (data: any) => {
            if (!data || !data.roleId) return;

            let parsed: ChannelPermissionOverride["overrides"] = {};
            try {
              parsed = typeof data.overrides === "string"
                ? JSON.parse(data.overrides)
                : data.overrides || {};
            } catch {
              // Empty overrides
            }

            overrides.push({
              roleId: data.roleId,
              overrides: parsed,
            });
          }
        );

      setTimeout(() => {
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          resolve(overrides);
        }
      }, 1000);
    });
  }

  /**
   * Set permission overrides for a role in a channel.
   */
  async setChannelOverride(
    nodeId: string,
    channelId: string,
    roleId: string,
    overrides: ChannelPermissionOverride["overrides"]
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve, reject) => {
      gun.get("nodes").get(nodeId).get("channels").get(channelId)
        .get("permissionOverrides").get(roleId).put(
          {
            roleId,
            overrides: JSON.stringify(overrides),
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (ack: any) => {
            if (ack.err) {
              reject(new Error(`Failed to set channel override: ${ack.err}`));
              return;
            }
            resolve();
          }
        );
    });
  }

  /**
   * Subscribe to role changes for a Node.
   */
  subscribeToRoles(
    nodeId: string,
    handler: (roles: Role[]) => void
  ): () => void {
    const gun = GunInstanceManager.get();
    const roles = new Map<string, Role>();

    const processRole = (data: unknown) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = data as any;
      if (!d || !d.id) return;

      let permissions: RolePermissions;
      try {
        permissions = typeof d.permissions === "string"
          ? JSON.parse(d.permissions)
          : d.permissions;
      } catch {
        const builtInId = d.id as keyof typeof DEFAULT_PERMISSIONS;
        permissions = DEFAULT_PERMISSIONS[builtInId] || DEFAULT_PERMISSIONS[BUILT_IN_ROLE_IDS.MEMBER];
      }

      roles.set(d.id, {
        id: d.id,
        name: d.name || "Unknown",
        color: d.color || "#95A5A6",
        position: d.position ?? 100,
        permissions,
        isBuiltIn: d.isBuiltIn ?? false,
        createdAt: d.createdAt || Date.now(),
        createdBy: d.createdBy || "",
      });

      // Emit sorted roles
      handler(Array.from(roles.values()).sort((a, b) => a.position - b.position));
    };

    const ref = gun.get("nodes").get(nodeId).get("roles").map().on(processRole);

    return () => {
      ref.off();
    };
  }
}

// Helper to generate a unique role ID
function generateRoleId(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Export singleton instance
export const roleManager = new RoleManager();
