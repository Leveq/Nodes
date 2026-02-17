// Core types for the Nodes platform
// These will be expanded in subsequent milestones

// Export permission resolver
export { PermissionResolver, createPermissionResolver } from "./permissions";

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
  roles: string[];        // Array of role IDs (e.g., ["role_moderator", "role_custom_xyz"])
  status?: UserStatus;
  // Legacy field - kept for backwards compatibility, derived from roles
  role?: "owner" | "admin" | "member";
}

export interface NodeChannel {
  id: string;
  name: string;
  type: "text" | "voice";
  topic: string;
  nodeId: string;
  createdAt: number;
  position: number; // For ordering in sidebar
  slowMode?: number; // Slow mode delay in seconds (0 = off)
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

// ── Role & Permission Types (Milestone 2.3) ──

export const BUILT_IN_ROLE_IDS = {
  OWNER: "role_owner",
  ADMIN: "role_admin",
  MODERATOR: "role_moderator",
  MEMBER: "role_member",
} as const;

export type BuiltInRoleId = typeof BUILT_IN_ROLE_IDS[keyof typeof BUILT_IN_ROLE_IDS];

export interface Role {
  id: string;
  name: string;
  color: string;           // hex color, e.g. "#E74C3C"
  position: number;        // 0 = highest (owner), higher number = lower rank
  permissions: RolePermissions;
  isBuiltIn: boolean;
  createdAt: number;
  createdBy: string;       // publicKey of creator
}

export interface RolePermissions {
  // Node management
  manageNode: boolean;           // Edit name, description, icon
  manageChannels: boolean;       // Create, delete, reorder channels
  editChannelSettings: boolean;  // Edit name, topic of existing channels

  // Role management
  manageRoles: boolean;          // Create, edit, delete roles
  assignRoles: boolean;          // Assign roles to members

  // Messaging
  sendMessages: boolean;
  sendFiles: boolean;
  useReactions: boolean;
  embedLinks: boolean;
  editOwnMessages: boolean;
  deleteOwnMessages: boolean;
  deleteAnyMessage: boolean;     // Moderation: delete others' messages

  // Moderation
  kickMembers: boolean;
  banMembers: boolean;
  manageInvites: boolean;
  viewAuditLog: boolean;

  // Voice (prep for 2.4)
  connectVoice: boolean;
  muteMembers: boolean;
  moveMembers: boolean;
  disconnectMembers: boolean;
}

export type OverrideState = "allow" | "deny" | "inherit";

export interface ChannelPermissionOverride {
  roleId: string;
  overrides: Partial<Record<keyof RolePermissions, OverrideState>>;
}

// Default permission sets for built-in roles
export const DEFAULT_PERMISSIONS: Record<BuiltInRoleId, RolePermissions> = {
  [BUILT_IN_ROLE_IDS.OWNER]: {
    manageNode: true, manageChannels: true, editChannelSettings: true,
    manageRoles: true, assignRoles: true,
    sendMessages: true, sendFiles: true, useReactions: true, embedLinks: true,
    editOwnMessages: true, deleteOwnMessages: true, deleteAnyMessage: true,
    kickMembers: true, banMembers: true, manageInvites: true, viewAuditLog: true,
    connectVoice: true, muteMembers: true, moveMembers: true, disconnectMembers: true,
  },
  [BUILT_IN_ROLE_IDS.ADMIN]: {
    manageNode: true, manageChannels: true, editChannelSettings: true,
    manageRoles: true, assignRoles: true,
    sendMessages: true, sendFiles: true, useReactions: true, embedLinks: true,
    editOwnMessages: true, deleteOwnMessages: true, deleteAnyMessage: true,
    kickMembers: true, banMembers: true, manageInvites: true, viewAuditLog: true,
    connectVoice: true, muteMembers: true, moveMembers: true, disconnectMembers: true,
  },
  [BUILT_IN_ROLE_IDS.MODERATOR]: {
    manageNode: false, manageChannels: false, editChannelSettings: true,
    manageRoles: false, assignRoles: false,
    sendMessages: true, sendFiles: true, useReactions: true, embedLinks: true,
    editOwnMessages: true, deleteOwnMessages: true, deleteAnyMessage: true,
    kickMembers: true, banMembers: false, manageInvites: false, viewAuditLog: true,
    connectVoice: true, muteMembers: true, moveMembers: false, disconnectMembers: true,
  },
  [BUILT_IN_ROLE_IDS.MEMBER]: {
    manageNode: false, manageChannels: false, editChannelSettings: false,
    manageRoles: false, assignRoles: false,
    sendMessages: true, sendFiles: true, useReactions: true, embedLinks: true,
    editOwnMessages: true, deleteOwnMessages: true, deleteAnyMessage: false,
    kickMembers: false, banMembers: false, manageInvites: false, viewAuditLog: false,
    connectVoice: true, muteMembers: false, moveMembers: false, disconnectMembers: false,
  },
};

// ── Voice Types (Milestone 2.4) ──

export type VoiceTier = "mesh" | "livekit";

export interface VoiceState {
  channelId: string | null;     // Currently connected voice channel
  tier: VoiceTier | null;       // Current connection tier
  muted: boolean;               // Self-muted
  deafened: boolean;            // Self-deafened
  speaking: boolean;            // Currently transmitting audio
  connecting: boolean;          // Connection in progress
}

export interface VoiceParticipant {
  publicKey: string;
  displayName: string;
  muted: boolean;               // Self-muted OR server-muted
  deafened: boolean;
  speaking: boolean;
  serverMuted: boolean;         // Muted by a moderator
  roleColor?: string;
}

export interface VoiceChannelState {
  channelId: string;
  participants: VoiceParticipant[];
  tier: VoiceTier;
  maxParticipants: number;
}

export interface NodeVoiceConfig {
  livekitUrl?: string;          // Custom LiveKit server URL
  livekitApiKey?: string;       // API key (stored encrypted)
  livekitApiSecret?: string;    // API secret (stored encrypted)
  useDefaultServer: boolean;    // Use community LiveKit instance
  maxUsersPerChannel: number;   // Default: 50
}

export const VOICE_CONSTANTS = {
  MESH_MAX_PARTICIPANTS: 6,
  DEFAULT_MAX_PARTICIPANTS: 50,
  SPEAKING_THRESHOLD_DB: -50,   // dB level to trigger "speaking" indicator
  SPEAKING_DEBOUNCE_MS: 200,    // Debounce to prevent flickering
  ICE_SERVERS: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
} as const;

// ── Moderation Types (Milestone 2.5) ──

export type AuditAction =
  | "member_kick"
  | "member_ban"
  | "member_unban"
  | "message_delete"
  | "message_bulk_delete"
  | "message_purge"
  | "slow_mode_set"
  | "slow_mode_clear"
  | "role_assign"
  | "role_remove"
  | "role_create"
  | "role_update"
  | "role_delete"
  | "channel_create"
  | "channel_delete"
  | "channel_update"
  | "voice_mute"
  | "voice_disconnect";

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  actorKey: string;         // publicKey of who performed the action
  actorName: string;        // Display name snapshot
  targetKey?: string;       // publicKey of target user (if applicable)
  targetName?: string;      // Target display name snapshot
  channelId?: string;       // Channel context (if applicable)
  channelName?: string;     // Channel name snapshot
  reason?: string;          // Optional reason provided by moderator
  metadata?: string;        // JSON string for action-specific data
  timestamp: number;
}

export interface BanEntry {
  publicKey: string;
  bannedBy: string;         // publicKey of the banner
  bannedAt: number;         // Timestamp
  reason: string;           // Optional reason (empty string if none)
}

export interface KickNotification {
  kickedBy: string;         // publicKey of the kicker
  kickedAt: number;         // Timestamp
  reason: string;           // Optional reason
  banned: boolean;          // True if this is a ban (not just a kick)
}

export interface SlowModeConfig {
  enabled: boolean;
  delaySeconds: number;     // 0, 5, 10, 30, 60, 300
}

export const SLOW_MODE_OPTIONS = [
  { value: 0, label: "Off" },
  { value: 5, label: "5 seconds" },
  { value: 10, label: "10 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 300, label: "5 minutes" },
] as const;

// Helper to create default built-in roles for a new Node
export function createDefaultRoles(creatorKey: string): Role[] {
  const now = Date.now();
  return [
    {
      id: BUILT_IN_ROLE_IDS.OWNER,
      name: "Owner",
      color: "#F1C40F",  // Gold
      position: 0,
      permissions: DEFAULT_PERMISSIONS[BUILT_IN_ROLE_IDS.OWNER],
      isBuiltIn: true,
      createdAt: now,
      createdBy: creatorKey,
    },
    {
      id: BUILT_IN_ROLE_IDS.ADMIN,
      name: "Admin",
      color: "#E74C3C",  // Red
      position: 1,
      permissions: DEFAULT_PERMISSIONS[BUILT_IN_ROLE_IDS.ADMIN],
      isBuiltIn: true,
      createdAt: now,
      createdBy: creatorKey,
    },
    {
      id: BUILT_IN_ROLE_IDS.MODERATOR,
      name: "Moderator",
      color: "#3498DB",  // Blue
      position: 2,
      permissions: DEFAULT_PERMISSIONS[BUILT_IN_ROLE_IDS.MODERATOR],
      isBuiltIn: true,
      createdAt: now,
      createdBy: creatorKey,
    },
    {
      id: BUILT_IN_ROLE_IDS.MEMBER,
      name: "Member",
      color: "#95A5A6",  // Gray
      position: 100,     // High number so custom roles can be inserted between
      permissions: DEFAULT_PERMISSIONS[BUILT_IN_ROLE_IDS.MEMBER],
      isBuiltIn: true,
      createdAt: now,
      createdBy: creatorKey,
    },
  ];
}

// ── Search Types (Milestone 3.1) ──

export type SearchScope = "current-channel" | "current-node" | "all-nodes" | "dms";

export interface SearchQuery {
  raw: string;              // Original user input
  terms: string[];          // Parsed search terms (non-filter tokens)
  filters: SearchFilters;   // Parsed filter values
}

export interface SearchFilters {
  from?: string;            // publicKey to filter by author
  in?: string;              // channelId to filter by channel
  before?: Date;            // Messages before this date
  after?: Date;             // Messages after this date
  has?: "file" | "image" | "link";  // Content type filter
}

export interface SearchResult {
  id: string;               // Message ID or document ID
  type: "message" | "dm";   // Result type
  content: string;          // Original message content
  contentSnippet: string;   // Highlighted snippet with matched terms
  authorKey: string;        // Author's public key
  authorName?: string;      // Resolved display name (may be cached)
  timestamp: number;
  channelId?: string;       // For messages
  channelName?: string;     // Resolved channel name
  nodeId?: string;          // For messages
  nodeName?: string;        // Resolved node name
  conversationId?: string;  // For DMs
  score: number;            // MiniSearch relevance score
  matches: string[];        // Which terms matched
}
