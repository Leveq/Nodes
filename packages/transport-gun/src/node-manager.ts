import type { NodeServer, NodeMember, NodeChannel, NodeInvite } from "@nodes/core";
import { GunInstanceManager } from "./gun-instance";

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

          // Add creator as owner member
          await this.addMember(id, creatorPublicKey, "owner");

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

        resolve({
          id: data.id,
          name: data.name || "",
          description: data.description || "",
          icon: data.icon || "",
          owner: data.owner || "",
          createdAt: data.createdAt || 0,
          inviteKey: data.inviteKey || "",
        });
      });
    });
  }

  /**
   * Update Node settings (owner only — enforce in UI).
   */
  async updateNode(
    nodeId: string,
    updates: Partial<Pick<NodeServer, "name" | "description" | "icon">>
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gun.get("nodes").get(nodeId).put(updates, (ack: any) => {
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

    gun.get("nodes").get(nodeId).put({
      name: null,
      description: null,
      icon: null,
      owner: null,
      inviteKey: null,
      deletedAt: Date.now(),
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

    // Check if already a member
    const existingMember = await this.getMember(invite.nodeId, publicKey);
    if (existingMember) {
      throw new Error("You're already a member of this Node.");
    }

    // Add as member
    await this.addMember(invite.nodeId, publicKey, "member");

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
   * Leave a Node (removes membership).
   */
  async leaveNode(nodeId: string, publicKey: string): Promise<void> {
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

    return {
      nodeId: parts[0],
      inviteKey: parts[1],
    };
  }

  // ── Member Management ──

  async addMember(
    nodeId: string,
    publicKey: string,
    role: "owner" | "admin" | "member"
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    gun.get("nodes").get(nodeId).get("members").get(publicKey).put({
      publicKey,
      joinedAt: Date.now(),
      role,
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
          role: data.role || "member",
        });
      });
    });
  }

  async getMembers(nodeId: string): Promise<NodeMember[]> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      const members: NodeMember[] = [];
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(members);
        }
      }, 3000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gun.get("nodes").get(nodeId).get("members").map().once((data: any) => {
        if (!data || !data.publicKey) return;

        members.push({
          publicKey: data.publicKey,
          displayName: "",
          joinedAt: data.joinedAt || 0,
          role: data.role || "member",
        });
      });

      setTimeout(() => {
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          resolve(members);
        }
      }, 1500);
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
    updates: Partial<Pick<NodeChannel, "name" | "topic" | "position">>
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    if (updates.name) {
      updates.name = sanitizeChannelName(updates.name);
    }

    gun.get("nodes").get(nodeId).get("channels").get(channelId).put(updates);
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
    const nodes: NodeServer[] = [];
    for (const id of nodeIds) {
      const node = await this.getNode(id);
      if (node && node.name) {
        nodes.push(node);
      }
    }
    return nodes;
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
        role: data.role || "member",
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
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `node-${timestamp}-${random}`;
}

function generateChannelId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ch-${timestamp}-${random}`;
}

function generateInviteKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let key = "";
  for (let i = 0; i < 24; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
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
