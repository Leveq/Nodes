import type { NodeServer, NodeMember, NodeChannel, NodeInvite } from "@nodes/core";
import { BUILT_IN_ROLE_IDS } from "@nodes/core";
import { GunInstanceManager } from "./gun-instance";
import { roleManager } from "./role-manager";

/**
 * NodeManager handles CRUD operations for Nodes (community servers).
 *
 * Node data lives in a shared GunJS graph (not a user graph) so all
 * members can read it. Ownership is tracked by the creator's public key.
 *
 * Channel messages are stored under the channel path (handled by MessageTransport).
 */
export class NodeManager {
  /**
   * Create a new Node.
   * - Generates a unique ID and invite key
   * - Stores Node metadata in shared graph
   * - Adds creator as owner in member list
   * - Creates default #general and #welcome channels
   * - Adds Node reference to creator's user graph
   */
  async createNode(
    name: string,
    description: string,
    icon: string,
    creatorPublicKey: string
  ): Promise<NodeServer> {
    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();

    const id = generateNodeId();
    const inviteKey = generateInviteKey();
    const now = Date.now();

    const node: NodeServer = {
      id,
      name,
      description,
      icon: icon || getDefaultIcon(name),
      owner: creatorPublicKey,
      createdAt: now,
      inviteKey,
    };

    // Store Node in shared graph
    return new Promise((resolve, reject) => {
      gun.get("nodes").get(id).put(
        {
          id: node.id,
          name: node.name,
          description: node.description,
          icon: node.icon,
          owner: node.owner,
          createdAt: node.createdAt,
          inviteKey: node.inviteKey,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (ack: any) => {
          if (ack.err) {
            reject(new Error(`Failed to create Node: ${ack.err}`));
            return;
          }

          // Initialize built-in roles
          await roleManager.initializeRoles(id, creatorPublicKey);

          // Add creator as owner member (with owner role)
          await this.addMember(id, creatorPublicKey, [BUILT_IN_ROLE_IDS.OWNER]);

          // Create default channels
          await this.createChannel(id, "general", "text", "General discussion", 0);
          await this.createChannel(id, "welcome", "text", "Welcome new members!", 1);

          // Add to user's Node list
          user.get("nodes").get(id).put({
            nodeId: id,
            joinedAt: now,
            lastVisited: now,
          });

          resolve(node);
        }
      );
    });
  }

  /**
   * Get a Node's metadata by ID.
   */
  async getNode(nodeId: string): Promise<NodeServer | null> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gun.get("nodes").get(nodeId).once((data: any) => {
        if (!data || !data.id) {
          resolve(null);
          return;
        }

        // Parse theme from JSON string (stored as themeJson to avoid Gun nested-node issues)
        let theme = undefined;
        if (data.themeJson) {
          try { theme = JSON.parse(data.themeJson); } catch { /* ignore */ }
        }

        resolve({
          id: data.id,
          name: data.name || "",
          description: data.description || "",
          icon: data.icon || "",
          owner: data.owner || "",
          createdAt: data.createdAt || 0,
          inviteKey: data.inviteKey || "",
          defaultRoleId: data.defaultRoleId || undefined,
          theme,
        });
      });
    });
  }

  /**
   * Update Node settings (owner only — enforce in UI).
   */
  async updateNode(
    nodeId: string,
    updates: Partial<Pick<NodeServer, "name" | "description" | "icon" | "theme" | "defaultRoleId">>
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    // Serialize theme as a JSON string to avoid Gun nested-node issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gunUpdates: Record<string, any> = { ...updates };
    if (updates.theme !== undefined) {
      gunUpdates.themeJson = updates.theme ? JSON.stringify(updates.theme) : null;
      delete gunUpdates.theme;
    }

    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gun.get("nodes").get(nodeId).put(gunUpdates, (ack: any) => {
        if (ack.err) reject(new Error(ack.err));
        else resolve();
      });
    });
  }

  /**
   * Delete a Node (owner only).
   * In Gun, we can't truly delete — we null out the fields and mark as deleted.
   */
  async deleteNode(nodeId: string): Promise<void> {
    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();

    // Null out the shared node data so other members detect the deletion
    gun.get("nodes").get(nodeId).put({
      name: null,
      description: null,
      icon: null,
      owner: null,
      inviteKey: null,
      deletedAt: Date.now(),
    });

    // Also remove from the owner's own node reference list so it doesn't
    // reappear on the next startup (leaveNode does the same for members)
    user.get("nodes").get(nodeId).put(null);
  }

  /**
   * Subscribe to a single Node's metadata for deletion and live-update detection.
   * `onDeleted` fires when the node is deleted.
   * `onThemeChange` fires with the parsed theme object (or null) when themeJson changes.
   */
  subscribeToNodeMeta(
    nodeId: string,
    onDeleted: () => void,
    onThemeChange?: (theme: import("@nodes/core").NodesTheme | null) => void
  ): () => void {
    const gun = GunInstanceManager.get();
    let lastThemeJson: string | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ref = gun.get("nodes").get(nodeId).on((data: any) => {
      if (!data) return;
      // Deleted nodes have deletedAt set OR name nulled out
      if (data.deletedAt || !data.name) {
        onDeleted();
        return;
      }
      // Detect theme changes for live re-apply on other clients
      if (onThemeChange && data.themeJson !== lastThemeJson) {
        lastThemeJson = data.themeJson;
        let theme = null;
        if (data.themeJson) {
          try { theme = JSON.parse(data.themeJson); } catch { /* ignore */ }
        }
        onThemeChange(theme);
      }
    });
    return () => ref.off();
  }

  /**
   * Fetch only the defaultRoleId field for a Node.
   * Uses a dedicated .once() path so it isn't dropped when the full node
   * object resolves before this leaf has synced to the local Gun cache.
   */
  async getNodeDefaultRoleId(nodeId: string): Promise<string | undefined> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(undefined);
        }
      }, 4000);

      gun.get("nodes").get(nodeId).get("defaultRoleId").once(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (data: any) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(typeof data === "string" && data ? data : undefined);
          }
        }
      );
    });
  }

  /**
   * Join a Node via invite.
   * Verifies the invite key matches before adding the user as a member.
   */
  async joinNode(invite: NodeInvite, publicKey: string): Promise<NodeServer> {
    const node = await this.getNode(invite.nodeId);

    if (!node) {
      throw new Error("Node not found. It may have been deleted.");
    }

    if (node.inviteKey !== invite.inviteKey) {
      throw new Error("Invalid invite link.");
    }

    // Check if banned
    const isBanned = await this.isUserBanned(invite.nodeId, publicKey);
    if (isBanned) {
      throw new Error("You are banned from this Node.");
    }

    // Check if already a member
    const existingMember = await this.getMember(invite.nodeId, publicKey);
    if (existingMember) {
      throw new Error("You're already a member of this Node.");
    }

    // Fetch defaultRoleId as a dedicated read so it isn't missed when the
    // main getNode() .once() fires before this leaf has synced on a fresh device.
    const resolvedDefaultRoleId = await this.getNodeDefaultRoleId(invite.nodeId);

    // Add as member with the node's configured default role (fall back to built-in member)
    const roleIds = resolvedDefaultRoleId && resolvedDefaultRoleId !== BUILT_IN_ROLE_IDS.OWNER
      ? [resolvedDefaultRoleId]
      : [BUILT_IN_ROLE_IDS.MEMBER];
    await this.addMember(invite.nodeId, publicKey, roleIds);

    // Add to user's Node list
    const user = GunInstanceManager.user();
    user.get("nodes").get(invite.nodeId).put({
      nodeId: invite.nodeId,
      joinedAt: Date.now(),
      lastVisited: Date.now(),
    });

    return node;
  }

  /**
   * Join a Node directly using nodeId and inviteKey.
   * Convenience method for joining from the directory without constructing a NodeInvite.
   */
  async joinNodeDirect(
    nodeId: string,
    inviteKey: string,
    publicKey: string
  ): Promise<NodeServer> {
    return this.joinNode({ nodeId, inviteKey }, publicKey);
  }

  /**
   * Check if a user is banned from a Node.
   */
  async isUserBanned(nodeId: string, publicKey: string): Promise<boolean> {
    const gun = GunInstanceManager.get();
    return new Promise((resolve) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false); // Assume not banned if can't fetch
        }
      }, 2000);

      gun
        .get("nodes")
        .get(nodeId)
        .get("bans")
        .get(publicKey)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once((data: any) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(!!data?.bannedAt);
          }
        });
    });
  }

  /**
   * Leave a Node (removes membership).
   */
  async leaveNode(nodeId: string, publicKey: string): Promise<void> {
    // Prevent owner from leaving without transferring ownership
    const node = await this.getNode(nodeId);
    if (node?.owner === publicKey) {
      throw new Error("Owner cannot leave. Transfer ownership first.");
    }

    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();

    // Remove from Node's member list
    gun.get("nodes").get(nodeId).get("members").get(publicKey).put(null);

    // Remove from user's Node list
    user.get("nodes").get(nodeId).put(null);
  }

  /**
   * Generate an invite string for a Node.
   */
  async generateInvite(nodeId: string): Promise<string> {
    const node = await this.getNode(nodeId);
    if (!node) throw new Error("Node not found");

    return `${node.id}/${node.inviteKey}`;
  }

  /**
   * Parse an invite string back into a NodeInvite.
   */
  parseInvite(inviteString: string): NodeInvite {
    // Handle various formats:
    // "nodeId/inviteKey"
    // "nodes://invite/nodeId/inviteKey"
    const cleaned = inviteString.replace("nodes://invite/", "").trim();

    const parts = cleaned.split("/");

    if (parts.length < 2) {
      throw new Error("Invalid invite format. Expected: nodeId/inviteKey");
    }

    const [nodeId, inviteKey] = parts;

    if (!nodeId.startsWith("node-")) {
      throw new Error("Invalid invite: malformed node ID.");
    }

    if (inviteKey.length < 20) {
      throw new Error("Invalid invite: invite key too short.");
    }

    return { nodeId, inviteKey };
  }

  // ── Member Management ──

  /**
   * Add a member to a Node.
   * @param roles - Array of role IDs, or legacy role string for backwards compat
   */
  async addMember(
    nodeId: string,
    publicKey: string,
    roles: string[] | "owner" | "admin" | "member"
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    // Convert legacy role string to roles array
    let roleIds: string[];
    let legacyRole: "owner" | "admin" | "member";

    if (Array.isArray(roles)) {
      roleIds = roles;
      // Derive legacy role for backwards compat
      if (roles.includes(BUILT_IN_ROLE_IDS.OWNER)) {
        legacyRole = "owner";
      } else if (roles.includes(BUILT_IN_ROLE_IDS.ADMIN)) {
        legacyRole = "admin";
      } else {
        legacyRole = "member";
      }
    } else {
      // Legacy: convert string to array
      legacyRole = roles;
      if (roles === "owner") {
        roleIds = [BUILT_IN_ROLE_IDS.OWNER];
      } else if (roles === "admin") {
        roleIds = [BUILT_IN_ROLE_IDS.ADMIN];
      } else {
        roleIds = [BUILT_IN_ROLE_IDS.MEMBER]; // Explicitly assign member role
      }
    }

    return new Promise((resolve, reject) => {
      gun.get("nodes").get(nodeId).get("members").get(publicKey).put(
        {
          publicKey,
          joinedAt: Date.now(),
          roles: JSON.stringify(roleIds),
          role: legacyRole,  // Keep legacy field for backwards compat
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ack: any) => {
          if (ack.err) reject(new Error(`Failed to add member: ${ack.err}`));
          else resolve();
        }
      );
    });
  }

  async getMember(nodeId: string, publicKey: string): Promise<NodeMember | null> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gun.get("nodes").get(nodeId).get("members").get(publicKey).once((data: any) => {
        if (!data || !data.publicKey) {
          resolve(null);
          return;
        }

        resolve({
          publicKey: data.publicKey,
          displayName: "", // Resolved separately via profile lookup
          joinedAt: data.joinedAt || 0,
          roles: this.parseRolesFromGunData(data),
        });
      });
    });
  }

  async getMembers(nodeId: string): Promise<NodeMember[]> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      const members: NodeMember[] = [];
      let resolved = false;

      // Max timeout - resolve with whatever we have
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(members);
        }
      }, 5000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gun.get("nodes").get(nodeId).get("members").map().once((data: any) => {
        if (!data || !data.publicKey) return;

        members.push({
          publicKey: data.publicKey,
          displayName: "",
          joinedAt: data.joinedAt || 0,
          roles: this.parseRolesFromGunData(data),
        });
      });

      // Early resolve after reasonable wait for Gun sync
      setTimeout(() => {
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          resolve(members);
        }
      }, 2500);
    });
  }

  /**
   * Kick a member (admin/owner only — enforce in UI).
   */
  async kickMember(nodeId: string, publicKey: string): Promise<void> {
    const gun = GunInstanceManager.get();
    gun.get("nodes").get(nodeId).get("members").get(publicKey).put(null);
  }

  // ── Channel Management ──

  async createChannel(
    nodeId: string,
    name: string,
    type: "text" | "voice",
    topic: string,
    position: number
  ): Promise<NodeChannel> {
    const gun = GunInstanceManager.get();
    const id = generateChannelId();
    const now = Date.now();

    const channel: NodeChannel = {
      id,
      name: sanitizeChannelName(name),
      type,
      topic,
      nodeId,
      createdAt: now,
      position,
    };

    return new Promise((resolve, reject) => {
      gun.get("nodes").get(nodeId).get("channels").get(id).put(
        {
          id: channel.id,
          name: channel.name,
          type: channel.type,
          topic: channel.topic,
          nodeId: channel.nodeId,
          createdAt: channel.createdAt,
          position: channel.position,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ack: any) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve(channel);
        }
      );
    });
  }

  async getChannels(nodeId: string): Promise<NodeChannel[]> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      const channels: NodeChannel[] = [];
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(channels.sort((a, b) => a.position - b.position));
        }
      }, 3000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gun.get("nodes").get(nodeId).get("channels").map().once((data: any) => {
        if (!data || !data.id) return;

        channels.push({
          id: data.id,
          name: data.name || "",
          type: data.type || "text",
          topic: data.topic || "",
          nodeId: data.nodeId || nodeId,
          createdAt: data.createdAt || 0,
          position: data.position ?? 0,
          slowMode: data.slowMode ?? 0,
        });
      });

      setTimeout(() => {
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          resolve(channels.sort((a, b) => a.position - b.position));
        }
      }, 1500);
    });
  }

  async updateChannel(
    nodeId: string,
    channelId: string,
    updates: Partial<Pick<NodeChannel, "name" | "topic" | "position" | "slowMode">>
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    const sanitized = updates.name
      ? { ...updates, name: sanitizeChannelName(updates.name) }
      : updates;

    gun.get("nodes").get(nodeId).get("channels").get(channelId).put(sanitized);
  }

  async deleteChannel(nodeId: string, channelId: string): Promise<void> {
    const gun = GunInstanceManager.get();
    gun.get("nodes").get(nodeId).get("channels").get(channelId).put(null);
  }

  // ── User's Node List ──

  /**
   * Get all Nodes the current user has joined.
   * Reads from the user's own graph for fast local lookup,
   * then resolves full Node data from the shared graph.
   */
  async getUserNodes(): Promise<NodeServer[]> {
    const user = GunInstanceManager.user();

    return new Promise((resolve) => {
      const nodeIds: string[] = [];
      let resolved = false;

      const timeout = setTimeout(async () => {
        if (!resolved) {
          resolved = true;
          const nodes = await this.resolveNodeList(nodeIds);
          resolve(nodes);
        }
      }, 3000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user.get("nodes").map().once((data: any) => {
        if (!data || !data.nodeId) return;
        nodeIds.push(data.nodeId);
      });

      setTimeout(async () => {
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          const nodes = await this.resolveNodeList(nodeIds);
          resolve(nodes);
        }
      }, 1500);
    });
  }

  private async resolveNodeList(nodeIds: string[]): Promise<NodeServer[]> {
    const user = GunInstanceManager.user();
    const results = await Promise.allSettled(nodeIds.map(id => this.getNode(id)));
    const valid: NodeServer[] = [];
    results.forEach((r, i) => {
      if (r.status !== "fulfilled") return;
      const n = r.value;
      if (n && n.name) {
        valid.push(n);
      } else {
        // Node was deleted or is empty — prune from user's own reference list
        // so it doesn't reappear on the next startup.
        user.get("nodes").get(nodeIds[i]).put(null);
      }
    });
    return valid;
  }

  private parseRolesFromGunData(data: { roles?: unknown; role?: string }): string[] {
    if (data.roles) {
      try {
        if (typeof data.roles === "string") return JSON.parse(data.roles);
        if (Array.isArray(data.roles)) return data.roles as string[];
        return [];
      } catch {
        return [];
      }
    }
    if (data.role === "owner") return [BUILT_IN_ROLE_IDS.OWNER];
    if (data.role === "admin") return [BUILT_IN_ROLE_IDS.ADMIN];
    if (data.role === "member") return [BUILT_IN_ROLE_IDS.MEMBER];
    return [];
  }

  /**
   * Subscribe to real-time changes on a Node's member list.
   */
  subscribeMemberChanges(
    nodeId: string,
    handler: (member: NodeMember) => void
  ): () => void {
    const gun = GunInstanceManager.get();
    
    // Throttle: collect members and flush periodically
    let pendingMembers: NodeMember[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    
    const flush = () => {
      flushTimer = null;
      const toProcess = pendingMembers;
      pendingMembers = [];
      for (const member of toProcess) {
        handler(member);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ref = gun.get("nodes").get(nodeId).get("members").map().on((data: any) => {
      if (!data || !data.publicKey) return;

      const member: NodeMember = {
        publicKey: data.publicKey,
        displayName: "",
        joinedAt: data.joinedAt || 0,
        roles: this.parseRolesFromGunData(data),
      };

      // Queue and schedule flush
      pendingMembers.push(member);
      if (flushTimer === null) {
        flushTimer = setTimeout(flush, 16);
      }
    });

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      ref.off();
    };
  }

  /**
   * Subscribe to real-time changes on a Node's channel list.
   */
  subscribeChannelChanges(
    nodeId: string,
    handler: (channel: NodeChannel) => void
  ): () => void {
    const gun = GunInstanceManager.get();
    
    // Throttle: collect channels and flush periodically
    let pendingChannels: NodeChannel[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    
    const flush = () => {
      flushTimer = null;
      const toProcess = pendingChannels;
      pendingChannels = [];
      for (const channel of toProcess) {
        handler(channel);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ref = gun.get("nodes").get(nodeId).get("channels").map().on((data: any) => {
      if (!data || !data.id) return;

      const channel: NodeChannel = {
        id: data.id,
        name: data.name || "",
        type: data.type || "text",
        topic: data.topic || "",
        nodeId: data.nodeId || nodeId,
        createdAt: data.createdAt || 0,
        position: data.position ?? 0,
        slowMode: data.slowMode ?? 0,
      };

      // Queue and schedule flush
      pendingChannels.push(channel);
      if (flushTimer === null) {
        flushTimer = setTimeout(flush, 16);
      }
    });

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      ref.off();
    };
  }
}

// ── Helpers ──

function generateNodeId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  return `node-${Date.now().toString(36)}-${random}`;
}

function generateChannelId(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  return `ch-${Date.now().toString(36)}-${random}`;
}

function generateInviteKey(): string {
  const bytes = new Uint8Array(18); // 18 bytes → 24 base64url chars
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function sanitizeChannelName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 32);
}

function getDefaultIcon(name: string): string {
  // Return the first letter as a placeholder icon
  return name.charAt(0).toUpperCase();
}

/**
 * Migration: patch members who were stored with empty roles[] due to a bug in addMember.
 * For any member with roles: [] but a valid legacy `role` field, backfill the roles array.
 * Safe to call multiple times (idempotent).
 */
export async function migrateMemberRoles(nodeId: string): Promise<void> {
  const gun = GunInstanceManager.get();

  return new Promise((resolve) => {
    let pending = 0;
    let scanComplete = false;

    const checkDone = () => {
      if (scanComplete && pending === 0) resolve();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gun.get("nodes").get(nodeId).get("members").map().once((data: any, key: string) => {
      if (!data || !data.publicKey) return;

      // Parse current roles
      let roles: string[] = [];
      if (data.roles) {
        try {
          roles = typeof data.roles === "string" ? JSON.parse(data.roles) : data.roles;
        } catch {
          roles = [];
        }
      }

      // Only migrate if roles is empty but legacy role field exists
      if (roles.length === 0 && data.role) {
        let migratedRoles: string[] = [BUILT_IN_ROLE_IDS.MEMBER];
        if (data.role === "owner") migratedRoles = [BUILT_IN_ROLE_IDS.OWNER];
        else if (data.role === "admin") migratedRoles = [BUILT_IN_ROLE_IDS.ADMIN];

        pending++;
        gun.get("nodes").get(nodeId).get("members").get(key).put(
          { roles: JSON.stringify(migratedRoles) },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (_ack: any) => {
            pending--;
            checkDone();
          }
        );
      }
    });

    // Give Gun time to enumerate members, then mark scan complete
    setTimeout(() => {
      scanComplete = true;
      checkDone();
    }, 3000);
  });
}
