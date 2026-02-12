// Core types for the Nodes platform
// These will be expanded in subsequent milestones

export interface User {
  publicKey: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  status: UserStatus;
  visibility: AccountVisibility;
}

export type UserStatus = "online" | "idle" | "dnd" | "offline";

export type AccountVisibility = "public" | "private";

export type FieldVisibility = "public" | "friends" | "node-members" | "nobody" | "custom";

export interface ProfileField<T = string> {
  value: T;
  visibility: FieldVisibility;
}

// ── Node (Server) Types ──

export interface NodeServer {
  id: string;
  name: string;
  description: string;
  icon: string; // Emoji or first letter placeholder
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

// Legacy aliases for backwards compatibility
export type Node = NodeServer;
export type Channel = NodeChannel;

export interface Message {
  id: string;
  content: string;
  timestamp: number;
  authorKey: string; // publicKey
  channelId: string;
  type: "text" | "system" | "file";
}

// ── Direct Message Types ──

export interface DMConversation {
  id: string; // Deterministic from participant keys
  recipientKey: string; // The OTHER user's public key
  recipientName?: string; // Resolved display name
  startedAt: number;
  lastMessageAt: number;
  lastMessagePreview: string; // Truncated last message (decrypted)
  unreadCount: number;
  lastReadAt?: number; // Timestamp of when user last read this conversation
}

export interface DMMessage {
  id: string;
  encrypted: string; // Encrypted content
  timestamp: number;
  authorKey: string;
  conversationId: string;
  type: "text" | "system";
  signature?: string;
}

// ── Social / Friend Types ──

export interface FriendRequest {
  id: string;
  fromKey: string;
  toKey: string;
  type: "friend";
  message: string;
  status: "pending" | "accepted" | "declined";
  createdAt: number;
  respondedAt: number | null;
}

export interface Friend {
  publicKey: string;
  displayName?: string;
  addedAt: number;
  nickname?: string;
}

export interface BlockedUser {
  publicKey: string;
  blockedAt: number;
}
