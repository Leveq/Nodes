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
  attachments?: string; // JSON-stringified FileAttachment[]
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
  type: "text" | "system" | "file";
  signature?: string;
  attachments?: string; // JSON-stringified FileAttachment[] (encrypted)
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

// ── File & Attachment Types (Milestone 2.1) ──

export interface FileAttachment {
  cid: string;                    // IPFS CID of the file
  thumbnailCid?: string;          // IPFS CID of thumbnail (images only)
  filename: string;               // Original filename (may be encrypted in DMs)
  mimeType: string;               // MIME type
  size: number;                   // File size in bytes
  width?: number;                 // Image width (images only)
  height?: number;                // Image height (images only)
  encrypted?: boolean;            // Whether the file is encrypted (DMs)
}

export interface AvatarData {
  full: string;                   // CID of 256x256 avatar
  small: string;                  // CID of 64x64 avatar
  updatedAt: number;
}

// File upload constraints
export const FILE_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024,        // 10MB
  MAX_FILES_PER_MESSAGE: 5,
  MAX_AVATAR_SIZE: 5 * 1024 * 1024,       // 5MB
  AVATAR_FULL_SIZE: 256,                  // 256x256
  AVATAR_SMALL_SIZE: 64,                  // 64x64
  THUMBNAIL_MAX_WIDTH: 300,               // 300px wide thumbnails
  ALLOWED_IMAGE_TYPES: [
    'image/png', 'image/jpeg', 'image/gif', 'image/webp'
  ] as const,
  ALLOWED_FILE_TYPES: [
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'application/zip',
    'video/mp4', 'audio/mpeg', 'audio/ogg'
  ] as const
} as const;
