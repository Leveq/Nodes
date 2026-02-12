# MILESTONE 1.4 — NODE (SERVER) CREATION
## Nodes: Decentralized Communication Platform

---

### OBJECTIVE
Implement community Nodes (the equivalent of Discord servers). Users can create Nodes, invite others via shareable links, join existing Nodes, and manage basic settings. Each Node contains text channels where members can communicate. This milestone also introduces the app shell layout — the sidebar-based navigation that will be the primary UI for the rest of development.

---

### DEFINITION OF DONE
- [ ] User can create a new Node with a name, description, and optional icon
- [ ] Node data is stored in the shared GunJS graph, owned by the creator
- [ ] Creator is automatically assigned as the Node owner
- [ ] User can generate an invite link (encoded Node ID + key)
- [ ] Another user can join a Node via invite link
- [ ] Node member list shows all members with their display names and presence status
- [ ] Default channels are created automatically (#general and #welcome)
- [ ] User can create additional text channels within a Node
- [ ] App shell layout: left sidebar (Node list), channel sidebar, main content area
- [ ] User can switch between Nodes in the sidebar
- [ ] User can switch between channels within a Node
- [ ] Node settings panel (name, description — owner only)
- [ ] Leave Node functionality (non-owners)
- [ ] Delete Node functionality (owner only, with confirmation)
- [ ] Toast notifications for all actions (created, joined, errors)
- [ ] All data flows through the transport abstraction layer
- [ ] Tests for Node CRUD, membership, and invite flows

---

### ARCHITECTURE CONTEXT
Reference: Architecture Spec **Section 2.4 (Data Models)**

**Node graph structure in GunJS:**
```
gun.get("nodes").get(nodeId) → {
  id, name, description, icon, owner (publicKey),
  createdAt, inviteKey
}

gun.get("nodes").get(nodeId).get("members").get(publicKey) → {
  publicKey, joinedAt, role ("owner" | "member")
}

gun.get("nodes").get(nodeId).get("channels").get(channelId) → {
  id, name, type ("text" | "voice"), topic, createdAt, position
}
```

**User's Node membership** (stored in user's own graph for fast lookup):
```
gun.user().get("nodes").get(nodeId) → {
  nodeId, joinedAt, lastVisited
}
```

**Invite links** encode the Node ID and a verification key:
```
nodes://invite/{nodeId}/{inviteKey}
```
For now (no custom protocol handler), use a simple string the user can copy/paste. The app will have an "Join Node" input where they paste it.

---

### STEP-BY-STEP INSTRUCTIONS

#### 1. ADD NODE TYPES TO CORE PACKAGE

**Update packages/core/src/index.ts** — add these types:

```typescript
// ── Node (Server) Types ──

export interface NodeServer {
  id: string;
  name: string;
  description: string;
  icon: string; // IPFS CID or emoji placeholder
  owner: string; // publicKey of creator
  createdAt: number;
  inviteKey: string; // Random key for invite link verification
}

export interface NodeMember {
  publicKey: string;
  displayName: string;
  joinedAt: number;
  role: "owner" | "admin" | "member";
  status?: UserStatus;
}

export interface NodeChannel {
  id: string;
  name: string;
  type: "text" | "voice";
  topic: string;
  nodeId: string;
  createdAt: number;
  position: number; // For ordering in sidebar
}

export interface NodeInvite {
  nodeId: string;
  inviteKey: string;
  nodeName?: string; // Optional metadata for display
}
```

#### 2. IMPLEMENT NODE MANAGER (packages/transport-gun)

**packages/transport-gun/src/node-manager.ts:**
```typescript
import { GunInstance } from "./gun-instance";
import type { NodeServer, NodeMember, NodeChannel, NodeInvite } from "@nodes/core";

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
    const gun = GunInstance.get();
    const user = GunInstance.user();

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
    const gun = GunInstance.get();

    return new Promise((resolve) => {
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
    const gun = GunInstance.get();

    return new Promise((resolve, reject) => {
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
    const gun = GunInstance.get();

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
    const user = GunInstance.user();
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
    const gun = GunInstance.get();
    const user = GunInstance.user();

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
    const cleaned = inviteString
      .replace("nodes://invite/", "")
      .trim();

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
    const gun = GunInstance.get();

    gun.get("nodes").get(nodeId).get("members").get(publicKey).put({
      publicKey,
      joinedAt: Date.now(),
      role,
    });
  }

  async getMember(nodeId: string, publicKey: string): Promise<NodeMember | null> {
    const gun = GunInstance.get();

    return new Promise((resolve) => {
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
    const gun = GunInstance.get();

    return new Promise((resolve) => {
      const members: NodeMember[] = [];
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(members);
        }
      }, 3000);

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
    const gun = GunInstance.get();
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
    const gun = GunInstance.get();
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
        (ack: any) => {
          if (ack.err) reject(new Error(ack.err));
          else resolve(channel);
        }
      );
    });
  }

  async getChannels(nodeId: string): Promise<NodeChannel[]> {
    const gun = GunInstance.get();

    return new Promise((resolve) => {
      const channels: NodeChannel[] = [];
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(channels.sort((a, b) => a.position - b.position));
        }
      }, 3000);

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
    const gun = GunInstance.get();

    if (updates.name) {
      updates.name = sanitizeChannelName(updates.name);
    }

    gun.get("nodes").get(nodeId).get("channels").get(channelId).put(updates);
  }

  async deleteChannel(nodeId: string, channelId: string): Promise<void> {
    const gun = GunInstance.get();
    gun.get("nodes").get(nodeId).get("channels").get(channelId).put(null);
  }

  // ── User's Node List ──

  /**
   * Get all Nodes the current user has joined.
   * Reads from the user's own graph for fast local lookup,
   * then resolves full Node data from the shared graph.
   */
  async getUserNodes(): Promise<NodeServer[]> {
    const user = GunInstance.user();

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
    const gun = GunInstance.get();

    const ref = gun.get("nodes").get(nodeId).get("members").map().on((data: any) => {
      if (!data || !data.publicKey) return;

      handler({
        publicKey: data.publicKey,
        displayName: "",
        joinedAt: data.joinedAt || 0,
        role: data.role || "member",
      });
    });

    return () => ref.off();
  }

  /**
   * Subscribe to real-time changes on a Node's channel list.
   */
  subscribeChannelChanges(
    nodeId: string,
    handler: (channel: NodeChannel) => void
  ): () => void {
    const gun = GunInstance.get();

    const ref = gun.get("nodes").get(nodeId).get("channels").map().on((data: any) => {
      if (!data || !data.id) return;

      handler({
        id: data.id,
        name: data.name || "",
        type: data.type || "text",
        topic: data.topic || "",
        nodeId: data.nodeId || nodeId,
        createdAt: data.createdAt || 0,
        position: data.position ?? 0,
      });
    });

    return () => ref.off();
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
```

**Update packages/transport-gun/src/index.ts** — add NodeManager export:
```typescript
export { NodeManager } from "./node-manager";
```

#### 3. CREATE NODE STORE (apps/desktop — Zustand)

**apps/desktop/src/stores/node-store.ts:**
```typescript
import { create } from "zustand";
import { NodeManager } from "@nodes/transport-gun";
import type { NodeServer, NodeMember, NodeChannel } from "@nodes/core";
import { useToastStore } from "./toast-store";

interface NodeState {
  // State
  nodes: NodeServer[];
  activeNodeId: string | null;
  activeChannelId: string | null;
  channels: Record<string, NodeChannel[]>; // nodeId → channels
  members: Record<string, NodeMember[]>; // nodeId → members
  isLoading: boolean;

  // Actions
  loadUserNodes: () => Promise<void>;
  createNode: (name: string, description: string, icon: string, creatorKey: string) => Promise<NodeServer>;
  joinNode: (inviteString: string, publicKey: string) => Promise<void>;
  leaveNode: (nodeId: string, publicKey: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  updateNode: (nodeId: string, updates: Partial<Pick<NodeServer, "name" | "description" | "icon">>) => Promise<void>;
  setActiveNode: (nodeId: string | null) => void;
  setActiveChannel: (channelId: string | null) => void;
  loadChannels: (nodeId: string) => Promise<void>;
  loadMembers: (nodeId: string) => Promise<void>;
  createChannel: (nodeId: string, name: string, topic?: string) => Promise<void>;
  deleteChannel: (nodeId: string, channelId: string) => Promise<void>;
  generateInvite: (nodeId: string) => Promise<string>;
}

const nodeManager = new NodeManager();

export const useNodeStore = create<NodeState>((set, get) => ({
  nodes: [],
  activeNodeId: null,
  activeChannelId: null,
  channels: {},
  members: {},
  isLoading: false,

  loadUserNodes: async () => {
    set({ isLoading: true });
    try {
      const nodes = await nodeManager.getUserNodes();
      set({ nodes, isLoading: false });

      // If we have nodes but no active one, select the first
      if (nodes.length > 0 && !get().activeNodeId) {
        get().setActiveNode(nodes[0].id);
      }
    } catch (err: any) {
      set({ isLoading: false });
      useToastStore.getState().addToast("error", `Failed to load Nodes: ${err.message}`);
    }
  },

  createNode: async (name, description, icon, creatorKey) => {
    set({ isLoading: true });
    try {
      const node = await nodeManager.createNode(name, description, icon, creatorKey);
      set((state) => ({
        nodes: [...state.nodes, node],
        isLoading: false,
      }));

      // Auto-select the new Node
      get().setActiveNode(node.id);

      useToastStore.getState().addToast("success", `Node "${name}" created.`);
      return node;
    } catch (err: any) {
      set({ isLoading: false });
      useToastStore.getState().addToast("error", `Failed to create Node: ${err.message}`);
      throw err;
    }
  },

  joinNode: async (inviteString, publicKey) => {
    set({ isLoading: true });
    try {
      const invite = nodeManager.parseInvite(inviteString);
      const node = await nodeManager.joinNode(invite, publicKey);

      set((state) => ({
        nodes: [...state.nodes, node],
        isLoading: false,
      }));

      get().setActiveNode(node.id);

      useToastStore.getState().addToast("success", `Joined "${node.name}".`);
    } catch (err: any) {
      set({ isLoading: false });
      useToastStore.getState().addToast("error", err.message);
      throw err;
    }
  },

  leaveNode: async (nodeId, publicKey) => {
    try {
      const node = get().nodes.find((n) => n.id === nodeId);
      await nodeManager.leaveNode(nodeId, publicKey);

      set((state) => ({
        nodes: state.nodes.filter((n) => n.id !== nodeId),
        activeNodeId: state.activeNodeId === nodeId ? null : state.activeNodeId,
        activeChannelId: state.activeNodeId === nodeId ? null : state.activeChannelId,
      }));

      useToastStore.getState().addToast("info", `Left "${node?.name || "Node"}".`);
    } catch (err: any) {
      useToastStore.getState().addToast("error", `Failed to leave: ${err.message}`);
    }
  },

  deleteNode: async (nodeId) => {
    try {
      const node = get().nodes.find((n) => n.id === nodeId);
      await nodeManager.deleteNode(nodeId);

      set((state) => ({
        nodes: state.nodes.filter((n) => n.id !== nodeId),
        activeNodeId: state.activeNodeId === nodeId ? null : state.activeNodeId,
        activeChannelId: state.activeNodeId === nodeId ? null : state.activeChannelId,
      }));

      useToastStore.getState().addToast("info", `Node "${node?.name || ""}" deleted.`);
    } catch (err: any) {
      useToastStore.getState().addToast("error", `Failed to delete: ${err.message}`);
    }
  },

  updateNode: async (nodeId, updates) => {
    try {
      await nodeManager.updateNode(nodeId, updates);

      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, ...updates } : n
        ),
      }));

      useToastStore.getState().addToast("success", "Node updated.");
    } catch (err: any) {
      useToastStore.getState().addToast("error", `Failed to update: ${err.message}`);
    }
  },

  setActiveNode: (nodeId) => {
    set({ activeNodeId: nodeId, activeChannelId: null });

    if (nodeId) {
      // Load channels and members for the active Node
      get().loadChannels(nodeId);
      get().loadMembers(nodeId);
    }
  },

  setActiveChannel: (channelId) => {
    set({ activeChannelId: channelId });
  },

  loadChannels: async (nodeId) => {
    try {
      const channels = await nodeManager.getChannels(nodeId);
      set((state) => ({
        channels: { ...state.channels, [nodeId]: channels },
      }));

      // Auto-select first channel if none active
      if (!get().activeChannelId && channels.length > 0) {
        set({ activeChannelId: channels[0].id });
      }
    } catch (err: any) {
      useToastStore.getState().addToast("error", `Failed to load channels: ${err.message}`);
    }
  },

  loadMembers: async (nodeId) => {
    try {
      const members = await nodeManager.getMembers(nodeId);
      set((state) => ({
        members: { ...state.members, [nodeId]: members },
      }));
    } catch (err: any) {
      useToastStore.getState().addToast("error", `Failed to load members: ${err.message}`);
    }
  },

  createChannel: async (nodeId, name, topic = "") => {
    try {
      const existingChannels = get().channels[nodeId] || [];
      const position = existingChannels.length;

      await nodeManager.createChannel(nodeId, name, "text", topic, position);

      // Reload channels
      await get().loadChannels(nodeId);

      useToastStore.getState().addToast("success", `Channel #${name} created.`);
    } catch (err: any) {
      useToastStore.getState().addToast("error", `Failed to create channel: ${err.message}`);
    }
  },

  deleteChannel: async (nodeId, channelId) => {
    try {
      await nodeManager.deleteChannel(nodeId, channelId);

      set((state) => ({
        channels: {
          ...state.channels,
          [nodeId]: (state.channels[nodeId] || []).filter((c) => c.id !== channelId),
        },
        activeChannelId:
          state.activeChannelId === channelId ? null : state.activeChannelId,
      }));

      useToastStore.getState().addToast("info", "Channel deleted.");
    } catch (err: any) {
      useToastStore.getState().addToast("error", `Failed to delete channel: ${err.message}`);
    }
  },

  generateInvite: async (nodeId) => {
    try {
      const invite = await nodeManager.generateInvite(nodeId);
      return invite;
    } catch (err: any) {
      useToastStore.getState().addToast("error", `Failed to generate invite: ${err.message}`);
      throw err;
    }
  },
}));
```

#### 4. BUILD THE APP SHELL LAYOUT

This is the primary layout for the rest of development. It mirrors Discord's layout pattern.

**apps/desktop/src/layouts/AppShell.tsx:**

```
┌──────────────────────────────────────────────────────────────┐
│ ┌────┐┌──────────────┐┌────────────────────────┐┌─────────┐ │
│ │Node││  Channel      ││   Main Content         ││ Member  │ │
│ │List││  Sidebar      ││   Area                 ││ List    │ │
│ │    ││               ││                        ││         │ │
│ │ 🟣 ││ # general     ││  (Channel messages     ││ Owner   │ │
│ │ 🔵 ││ # welcome     ││   will go here in      ││ ──────  │ │
│ │ 🟢 ││ # dev         ││   Milestone 1.5)       ││ Member1 │ │
│ │    ││               ││                        ││ Member2 │ │
│ │ +  ││ + Add Channel ││                        ││         │ │
│ │    ││               ││                        ││         │ │
│ │    ││ Node Name     ││                        ││         │ │
│ │    ││ Settings ⚙    ││                        ││         │ │
│ └────┘└──────────────┘└────────────────────────┘└─────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Status Bar: Connection ● Connected    kdogg  Public      │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Component structure:**
```
AppShell.tsx
├── NodeSidebar.tsx          # Narrow left bar — Node icons, create/join buttons
├── ChannelSidebar.tsx       # Channel list for active Node, Node name, settings
├── MainContent.tsx          # Placeholder for now (messages in 1.5)
├── MemberSidebar.tsx        # Member list for active Node with presence dots
└── StatusBar.tsx            # Connection + user info (existing, moved here)
```

**Layout specs:**
- Node sidebar: `w-[72px]` fixed, dark background (`bg-[#1a1a28]`), centered icons
- Channel sidebar: `w-[240px]` fixed, slightly lighter (`bg-nodes-surface`)
- Main content: `flex-1`, fills remaining space
- Member sidebar: `w-[240px]` fixed, same as channel sidebar, collapsible (toggle button)
- Status bar: full width bottom bar, `h-[32px]`

**NodeSidebar.tsx should contain:**
- Vertical list of Node icons (first letter of name in a colored circle, or emoji)
- Active Node highlighted with a left border accent or pill indicator
- Separator line
- "+" button to create a new Node
- "Join" button (arrow/door icon) to join via invite
- Each icon has a tooltip showing the Node name on hover

**ChannelSidebar.tsx should contain:**
- Node name at the top (bold) with a dropdown arrow for settings
- Divider
- Channel list grouped by type (TEXT CHANNELS header)
- Each channel: `# channel-name` with hover highlight
- Active channel has accent background
- "+" button next to the section header to create a channel
- At the bottom: user panel showing current user avatar placeholder, name, status dot

**MemberSidebar.tsx should contain:**
- Header: "Members — {count}"
- Members grouped by role: OWNER, ADMINS, MEMBERS
- Each member: presence dot + display name (resolved from profile)
- Online members sorted to top within each group
- Offline members shown with muted text

---

#### 5. CREATE NODE MODAL

**apps/desktop/src/components/modals/CreateNodeModal.tsx:**

A modal dialog for creating a new Node:
- Input: Node name (required, max 48 chars)
- Input: Description (optional, max 256 chars)
- Input: Icon (optional — emoji picker or single character, default to first letter)
- Button: "Create Node"
- Uses the Button component from polish pass
- On success: closes modal, Node appears in sidebar, auto-selected

---

#### 6. JOIN NODE MODAL

**apps/desktop/src/components/modals/JoinNodeModal.tsx:**

A modal dialog for joining via invite:
- Input: Paste invite link/code
- Shows preview of Node name if the invite can be resolved
- Button: "Join Node"
- Validates format before attempting join
- On success: closes modal, Node appears in sidebar

---

#### 7. NODE SETTINGS PANEL

**apps/desktop/src/components/node/NodeSettings.tsx:**

A slide-out panel or modal for Node settings (owner only):
- Edit name
- Edit description
- Invite link display with "Copy" button and "Regenerate" option
- Danger zone: Delete Node (with confirmation modal — "Type the Node name to confirm")
- Non-owners see: Node info (read-only) + "Leave Node" button with confirmation

---

#### 8. CREATE CHANNEL MODAL

**apps/desktop/src/components/modals/CreateChannelModal.tsx:**

- Input: Channel name (auto-sanitized to lowercase-with-dashes as they type)
- Input: Topic (optional)
- Channel type selector: Text (default) | Voice (disabled/grayed out — "Coming in Phase 2")
- Button: "Create Channel"

---

#### 9. WIRE UP APP.TSX

Replace the current Dashboard with the AppShell layout:

**apps/desktop/src/App.tsx:**
```tsx
import "./styles/globals.css";
import { TransportProvider } from "./providers/TransportProvider";
import { AuthGate } from "./components/auth/AuthGate";
import { AppShell } from "./layouts/AppShell";
import { ToastContainer } from "./components/ToastContainer";

function App() {
  return (
    <TransportProvider>
      <AuthGate>
        <AppShell />
      </AuthGate>
      <ToastContainer />
    </TransportProvider>
  );
}

export default App;
```

#### 10. LOAD NODES ON AUTH

In AuthGate or AppShell, when the user authenticates, immediately load their Node list:

```typescript
useEffect(() => {
  if (isAuthenticated) {
    useNodeStore.getState().loadUserNodes();
  }
}, [isAuthenticated]);
```

#### 11. EMPTY STATES

Every section needs an empty state — don't show blank space:

**No Nodes joined:**
- Center in main content area: "You haven't joined any Nodes yet."
- Two buttons: "Create a Node" and "Join with Invite"

**No channels in Node:**
- "This Node has no channels yet."
- "Create a Channel" button (if owner/admin)

**No members loaded yet:**
- Skeleton/loading placeholders in member list

**Node selected but no channel selected:**
- "Select a channel to start chatting."

---

### VERIFICATION CHECKLIST

1. **Create a Node** — Click "+", fill form, Node appears in left sidebar with icon
2. **Default channels** — #general and #welcome are auto-created and visible in channel sidebar
3. **Switch Nodes** — Click between Node icons, channel sidebar updates correctly
4. **Switch channels** — Click between channels, active state highlights correctly
5. **Create channel** — New channel appears in list, properly sanitized name
6. **Generate invite** — Copy invite string from Node settings
7. **Join Node (second user)** — Paste invite on second instance, Node appears in their sidebar
8. **Member list** — Both users visible in member sidebar with presence dots
9. **Leave Node** — Non-owner leaves, removed from member list and their sidebar
10. **Delete Node** — Owner deletes, Node disappears from all members' sidebars
11. **Node settings** — Owner can edit name/description, changes reflect immediately
12. **Empty states** — All empty states render correctly
13. **Toasts** — Every action produces appropriate toast notification
14. **Responsive** — Layout doesn't break at different window sizes (min 940x560)
15. **`pnpm lint`** — Clean
16. **`pnpm test`** — All tests pass

---

### NEXT MILESTONE

Once 1.4 is verified, proceed to **Milestone 1.5: Text Channels** which will:
- Real-time message send/receive in channels via the MessageTransport
- Message input component with send button and Enter key support
- Message list with auto-scroll, timestamps, and author display names
- Message grouping by author (consecutive messages collapsed)
- Typing indicators ("kdogg is typing...")
- Unread message indicators on channels
- Message history loading on channel switch
