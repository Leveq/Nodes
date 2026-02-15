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
  loadingChannels: Record<string, boolean>; // nodeId → loading state
  isLoading: boolean;

  // Actions
  loadUserNodes: () => Promise<void>;
  createNode: (
    name: string,
    description: string,
    icon: string,
    creatorKey: string
  ) => Promise<NodeServer>;
  joinNode: (inviteString: string, publicKey: string) => Promise<void>;
  leaveNode: (nodeId: string, publicKey: string) => Promise<void>;
  deleteNode: (nodeId: string) => Promise<void>;
  updateNode: (
    nodeId: string,
    updates: Partial<Pick<NodeServer, "name" | "description" | "icon">>
  ) => Promise<void>;
  setActiveNode: (nodeId: string | null) => void;
  setActiveChannel: (channelId: string | null) => void;
  loadChannels: (nodeId: string) => Promise<void>;
  loadMembers: (nodeId: string) => Promise<void>;
  createChannel: (nodeId: string, name: string, topic?: string, type?: "text" | "voice") => Promise<void>;
  deleteChannel: (nodeId: string, channelId: string) => Promise<void>;
  generateInvite: (nodeId: string) => Promise<string>;
  getActiveNode: () => NodeServer | null;
  getActiveChannel: () => NodeChannel | null;
}

const nodeManager = new NodeManager();

export const useNodeStore = create<NodeState>((set, get) => ({
  nodes: [],
  activeNodeId: null,
  activeChannelId: null,
  channels: {},
  members: {},
  loadingChannels: {},
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
    } catch (err: unknown) {
      set({ isLoading: false });
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to load Nodes: ${message}`);
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
    } catch (err: unknown) {
      set({ isLoading: false });
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to create Node: ${message}`);
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
    } catch (err: unknown) {
      set({ isLoading: false });
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", message);
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
        activeChannelId:
          state.activeNodeId === nodeId ? null : state.activeChannelId,
      }));

      useToastStore.getState().addToast("info", `Left "${node?.name || "Node"}".`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to leave: ${message}`);
    }
  },

  deleteNode: async (nodeId) => {
    try {
      const node = get().nodes.find((n) => n.id === nodeId);
      await nodeManager.deleteNode(nodeId);

      set((state) => ({
        nodes: state.nodes.filter((n) => n.id !== nodeId),
        activeNodeId: state.activeNodeId === nodeId ? null : state.activeNodeId,
        activeChannelId:
          state.activeNodeId === nodeId ? null : state.activeChannelId,
      }));

      useToastStore.getState().addToast("info", `Node "${node?.name || ""}" deleted.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to delete: ${message}`);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to update: ${message}`);
    }
  },

  setActiveNode: (nodeId) => {
    // Check if we have cached channels for this node
    const cachedChannels = nodeId ? get().channels[nodeId] : null;
    const firstChannelId = cachedChannels?.[0]?.id ?? null;

    // If we have cached channels, auto-select first immediately
    set({ activeNodeId: nodeId, activeChannelId: firstChannelId });

    if (nodeId) {
      // Load channels and members for the active Node (will refresh cache)
      get().loadChannels(nodeId);
      get().loadMembers(nodeId);
    }
  },

  setActiveChannel: (channelId) => {
    set({ activeChannelId: channelId });
  },

  loadChannels: async (nodeId) => {
    // Mark as loading (only if not already cached)
    const hasCached = (get().channels[nodeId]?.length ?? 0) > 0;
    if (!hasCached) {
      set((state) => ({
        loadingChannels: { ...state.loadingChannels, [nodeId]: true },
      }));
    }

    try {
      const channels = await nodeManager.getChannels(nodeId);
      set((state) => ({
        channels: { ...state.channels, [nodeId]: channels },
        loadingChannels: { ...state.loadingChannels, [nodeId]: false },
      }));

      // Auto-select first channel if none active
      if (!get().activeChannelId && channels.length > 0) {
        set({ activeChannelId: channels[0].id });
      }
    } catch (err: unknown) {
      set((state) => ({
        loadingChannels: { ...state.loadingChannels, [nodeId]: false },
      }));
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to load channels: ${message}`);
    }
  },

  loadMembers: async (nodeId) => {
    try {
      const members = await nodeManager.getMembers(nodeId);
      set((state) => ({
        members: { ...state.members, [nodeId]: members },
      }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to load members: ${message}`);
    }
  },

  createChannel: async (nodeId, name, topic = "", type = "text") => {
    try {
      const existingChannels = get().channels[nodeId] || [];
      const position = existingChannels.length;

      await nodeManager.createChannel(nodeId, name, type, topic, position);

      // Reload channels
      await get().loadChannels(nodeId);

      useToastStore.getState().addToast("success", `Channel #${name} created.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to create channel: ${message}`);
    }
  },

  deleteChannel: async (nodeId, channelId) => {
    try {
      await nodeManager.deleteChannel(nodeId, channelId);

      set((state) => ({
        channels: {
          ...state.channels,
          [nodeId]: (state.channels[nodeId] || []).filter(
            (c) => c.id !== channelId
          ),
        },
        activeChannelId:
          state.activeChannelId === channelId ? null : state.activeChannelId,
      }));

      useToastStore.getState().addToast("info", "Channel deleted.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to delete channel: ${message}`);
    }
  },

  generateInvite: async (nodeId) => {
    try {
      const invite = await nodeManager.generateInvite(nodeId);
      return invite;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to generate invite: ${message}`);
      throw err;
    }
  },

  getActiveNode: () => {
    const { nodes, activeNodeId } = get();
    return nodes.find((n) => n.id === activeNodeId) || null;
  },

  getActiveChannel: () => {
    const { channels, activeNodeId, activeChannelId } = get();
    if (!activeNodeId || !activeChannelId) return null;
    const nodeChannels = channels[activeNodeId] || [];
    return nodeChannels.find((c) => c.id === activeChannelId) || null;
  },
}));
