// Core types for the Nodes platform
// These will be expanded in subsequent milestones

export type JsonStringified<T> = string & { readonly __type?: T };

// Export permission resolver
export { PermissionResolver, createPermissionResolver } from "./permissions";

// Export mention utilities
export * from "./mentions";

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
  theme?: NodesTheme | null; // Custom Node theme (applies to all members by default)
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
  attachments?: JsonStringified<FileAttachment[]>; // JSON-stringified FileAttachment[]
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
  attachments?: JsonStringified<FileAttachment[]>; // JSON-stringified FileAttachment[] (encrypted)
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
  metadata?: JsonStringified<Record<string, unknown>>;        // JSON string for action-specific data
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

// ── Discovery Types (Milestone 3.2) ──

export const NODE_CATEGORIES = [
  "gaming",
  "technology",
  "music",
  "art-creative",
  "education",
  "science",
  "crypto-web3",
  "sports",
  "entertainment",
  "social",
  "programming",
  "other",
] as const;

export type NodeCategory = typeof NODE_CATEGORIES[number];

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  "gaming": "Gaming",
  "technology": "Technology",
  "music": "Music",
  "art-creative": "Art & Creative",
  "education": "Education",
  "science": "Science",
  "crypto-web3": "Crypto & Web3",
  "sports": "Sports",
  "entertainment": "Entertainment",
  "social": "Social",
  "programming": "Programming",
  "other": "Other",
};

export const CATEGORY_ICONS: Record<NodeCategory, string> = {
  "gaming": "🎮",
  "technology": "💻",
  "music": "🎵",
  "art-creative": "🎨",
  "education": "📚",
  "science": "🔬",
  "crypto-web3": "⛓️",
  "sports": "⚽",
  "entertainment": "🎬",
  "social": "💬",
  "programming": "👨‍💻",
  "other": "📌",
};

export interface DirectoryListing {
  nodeId: string;
  name: string;
  shortDescription: string;   // Max 150 chars, optimized for directory card
  description: string;        // Full description shown in preview
  icon: string;               // IPFS CID or emoji
  category: NodeCategory;
  tags: string[];
  memberCount: number;
  channelCount: number;
  channelNames: string[];     // For preview
  ownerKey: string;
  ownerName: string;
  inviteKey: string;          // For direct join from directory
  createdAt: number;
  listedAt: number;           // When first listed in directory
  lastRefreshed: number;      // Last time the listing was updated
}

export type DirectorySortBy = "members" | "newest" | "alphabetical";

export interface DirectoryFilters {
  search?: string;
  category?: NodeCategory;
  tags?: string[];
  sortBy: DirectorySortBy;
}

// ── Notification Types ──

export type NotificationType = "mention" | "dm" | "reply" | "role_mention" | "everyone" | "here";
export type ChannelNotificationLevel = "default" | "all" | "mentions" | "nothing";
export type NodeNotificationLevel = "all" | "mentions" | "nothing";

export interface GlobalNotificationSettings {
  desktop: boolean;
  sound: boolean;
  dmNotifications: boolean;
  dnd: boolean;
  soundChoice: string;
}

export interface NodeNotificationSetting {
  level: NodeNotificationLevel;
  suppressEveryone: boolean;
}

export interface ChannelNotificationSetting {
  level: ChannelNotificationLevel;
}

export interface NotificationSettings {
  global: GlobalNotificationSettings;
  nodes: Record<string, NodeNotificationSetting>;
  channels: Record<string, ChannelNotificationSetting>;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  nodeId?: string;
  nodeName?: string;
  channelId?: string;
  channelName?: string;
  senderKey: string;
  senderName: string;
  messageId: string;
  messagePreview: string;
  timestamp: number;
  read: boolean;
}

export type MentionType = "user" | "role" | "everyone" | "here";

export interface ParsedMention {
  type: MentionType;
  id: string;
  raw: string;
  startIndex: number;
  endIndex: number;
}

export const MENTION_PATTERNS = {
  USER: /<@([a-zA-Z0-9_.-]+)>/g,
  ROLE: /<@&([a-zA-Z0-9_.-]+)>/g,
  EVERYONE: /<@everyone>/g,
  HERE: /<@here>/g,
} as const;

export type MessageSegment =
  | { type: "text"; content: string }
  | { type: "user_mention"; publicKey: string }
  | { type: "role_mention"; roleId: string }
  | { type: "everyone" }
  | { type: "here" };

// ── Theme Types (Milestone 3.4) ──

export interface ThemeColors {
  // Backgrounds
  bgPrimary: string;        // Main content area
  bgSecondary: string;      // Sidebar, panels
  bgTertiary: string;       // Elevated elements (modals, dropdowns)
  bgInput: string;          // Input fields
  bgHover: string;          // Hover state on items

  // Text
  textPrimary: string;      // Main text
  textSecondary: string;    // Secondary/less important text
  textMuted: string;        // Disabled, hints, timestamps

  // Accent
  accent: string;           // Primary action color
  accentHover: string;      // Hover state
  accentMuted: string;      // Subtle backgrounds (mention highlight, selection)
  accentText: string;       // Text on accent backgrounds

  // Status
  danger: string;           // Destructive actions, errors
  dangerHover: string;
  success: string;          // Online, success states
  warning: string;          // Idle, warnings
  info: string;             // Information

  // Borders & Dividers
  border: string;           // Default borders
  borderStrong: string;     // Emphasized borders

  // Specific UI
  mentionBg: string;        // @mention highlight background
  mentionText: string;      // @mention text color
  codeBg: string;           // Code block background
  linkColor: string;        // Hyperlink color

  // Scrollbar (optional)
  scrollbarTrack?: string;
  scrollbarThumb?: string;
}

export interface NodesTheme {
  id: string;
  name: string;
  author?: string;
  version: number;          // Schema version for forward compat
  isBuiltIn: boolean;
  colors: ThemeColors;
}

export interface ThemeSettings {
  activeThemeId: string;
  accentColorOverride?: string;   // Null = use theme default
  fontSize: "small" | "default" | "large" | "xlarge";
  compactMode: boolean;
  respectNodeThemes: boolean;     // True = apply Node themes when entering Nodes
  customThemes: NodesTheme[];
}

export const BUILT_IN_THEMES: NodesTheme[] = [
  {
    id: "dark",
    name: "Dark",
    isBuiltIn: true,
    version: 1,
    colors: {
      bgPrimary: "#1e1e2e",
      bgSecondary: "#181825",
      bgTertiary: "#313244",
      bgInput: "#1e1e2e",
      bgHover: "#2a2a3c",
      textPrimary: "#cdd6f4",
      textSecondary: "#a6adc8",
      textMuted: "#585b70",
      accent: "#7c3aed",
      accentHover: "#6d28d9",
      accentMuted: "rgba(124, 58, 237, 0.15)",
      accentText: "#ffffff",
      danger: "#f38ba8",
      dangerHover: "#e06688",
      success: "#a6e3a1",
      warning: "#f9e2af",
      info: "#89b4fa",
      border: "#313244",
      borderStrong: "#45475a",
      mentionBg: "rgba(124, 58, 237, 0.3)",
      mentionText: "#cba6f7",
      codeBg: "#11111b",
      linkColor: "#89b4fa",
    },
  },
  {
    id: "light",
    name: "Light",
    isBuiltIn: true,
    version: 1,
    colors: {
      bgPrimary: "#ffffff",
      bgSecondary: "#f5f5f5",
      bgTertiary: "#e8e8e8",
      bgInput: "#ffffff",
      bgHover: "#ebebeb",
      textPrimary: "#1a1a1a",
      textSecondary: "#555555",
      textMuted: "#999999",
      accent: "#7c3aed",
      accentHover: "#6d28d9",
      accentMuted: "rgba(124, 58, 237, 0.1)",
      accentText: "#ffffff",
      danger: "#dc2626",
      dangerHover: "#b91c1c",
      success: "#16a34a",
      warning: "#d97706",
      info: "#2563eb",
      border: "#e0e0e0",
      borderStrong: "#cccccc",
      mentionBg: "rgba(124, 58, 237, 0.15)",
      mentionText: "#7c3aed",
      codeBg: "#f0f0f0",
      linkColor: "#2563eb",
    },
  },
  {
    id: "oled",
    name: "OLED Black",
    isBuiltIn: true,
    version: 1,
    colors: {
      bgPrimary: "#000000",
      bgSecondary: "#0a0a0a",
      bgTertiary: "#1a1a1a",
      bgInput: "#0a0a0a",
      bgHover: "#1a1a1a",
      textPrimary: "#e0e0e0",
      textSecondary: "#999999",
      textMuted: "#555555",
      accent: "#22c55e",
      accentHover: "#16a34a",
      accentMuted: "rgba(34, 197, 94, 0.15)",
      accentText: "#ffffff",
      danger: "#ef4444",
      dangerHover: "#dc2626",
      success: "#22c55e",
      warning: "#f59e0b",
      info: "#3b82f6",
      border: "#1a1a1a",
      borderStrong: "#2a2a2a",
      mentionBg: "rgba(34, 197, 94, 0.2)",
      mentionText: "#4ade80",
      codeBg: "#0a0a0a",
      linkColor: "#60a5fa",
    },
  },
  {
    id: "midnight",
    name: "Midnight Blue",
    isBuiltIn: true,
    version: 1,
    colors: {
      bgPrimary: "#0f172a",
      bgSecondary: "#0c1222",
      bgTertiary: "#1e293b",
      bgInput: "#0f172a",
      bgHover: "#1a2744",
      textPrimary: "#e2e8f0",
      textSecondary: "#94a3b8",
      textMuted: "#475569",
      accent: "#3b82f6",
      accentHover: "#2563eb",
      accentMuted: "rgba(59, 130, 246, 0.15)",
      accentText: "#ffffff",
      danger: "#f87171",
      dangerHover: "#ef4444",
      success: "#4ade80",
      warning: "#fbbf24",
      info: "#60a5fa",
      border: "#1e293b",
      borderStrong: "#334155",
      mentionBg: "rgba(59, 130, 246, 0.3)",
      mentionText: "#93c5fd",
      codeBg: "#0c1222",
      linkColor: "#60a5fa",
    },
  },
  {
    id: "forest",
    name: "Forest",
    isBuiltIn: true,
    version: 1,
    colors: {
      bgPrimary: "#1a2e1a",
      bgSecondary: "#142414",
      bgTertiary: "#2d4a2d",
      bgInput: "#1a2e1a",
      bgHover: "#243824",
      textPrimary: "#d4e8d4",
      textSecondary: "#9ab89a",
      textMuted: "#5a7a5a",
      accent: "#22c55e",
      accentHover: "#16a34a",
      accentMuted: "rgba(34, 197, 94, 0.15)",
      accentText: "#ffffff",
      danger: "#f87171",
      dangerHover: "#ef4444",
      success: "#4ade80",
      warning: "#fbbf24",
      info: "#60a5fa",
      border: "#2d4a2d",
      borderStrong: "#3d6a3d",
      mentionBg: "rgba(34, 197, 94, 0.3)",
      mentionText: "#86efac",
      codeBg: "#142414",
      linkColor: "#86efac",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    isBuiltIn: true,
    version: 1,
    colors: {
      bgPrimary: "#2d1b2e",
      bgSecondary: "#231424",
      bgTertiary: "#3d2b3e",
      bgInput: "#2d1b2e",
      bgHover: "#3a2540",
      textPrimary: "#f0ddf2",
      textSecondary: "#c4a0c8",
      textMuted: "#7a5a7e",
      accent: "#f97316",
      accentHover: "#ea580c",
      accentMuted: "rgba(249, 115, 22, 0.15)",
      accentText: "#ffffff",
      danger: "#f87171",
      dangerHover: "#ef4444",
      success: "#4ade80",
      warning: "#fbbf24",
      info: "#60a5fa",
      border: "#3d2b3e",
      borderStrong: "#5a4060",
      mentionBg: "rgba(249, 115, 22, 0.3)",
      mentionText: "#fdba74",
      codeBg: "#231424",
      linkColor: "#fdba74",
    },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    isBuiltIn: true,
    version: 1,
    colors: {
      bgPrimary: "#0a0a1a",
      bgSecondary: "#060612",
      bgTertiary: "#14142a",
      bgInput: "#0a0a1a",
      bgHover: "#141430",
      textPrimary: "#e0e0ff",
      textSecondary: "#8888cc",
      textMuted: "#444488",
      accent: "#ff00ff",
      accentHover: "#cc00cc",
      accentMuted: "rgba(255, 0, 255, 0.15)",
      accentText: "#ffffff",
      danger: "#ff3366",
      dangerHover: "#cc2952",
      success: "#00ff88",
      warning: "#ffff00",
      info: "#00ccff",
      border: "#1a1a3a",
      borderStrong: "#2a2a5a",
      mentionBg: "rgba(255, 0, 255, 0.3)",
      mentionText: "#ff66ff",
      codeBg: "#060612",
      linkColor: "#00ccff",
    },
  },
];
