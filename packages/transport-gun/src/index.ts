export { GunAuthProvider } from "./auth-provider";
export { GunInstanceManager } from "./gun-instance";
export { ProfileManager } from "./profile-manager";
export type { ProfileData, ProfileWithVisibility } from "./profile-manager";

// Transport implementations
export { GunMessageTransport, generateMessageId } from "./message-transport";
export { GunPresenceTransport } from "./presence-transport";
export { GunConnectionMonitor } from "./connection-monitor";
export { LocalFileTransport } from "./file-transport";

// IPFS (Milestone 2.1)
export { IPFSService, getCachedDownload, setCachedDownload } from "./ipfs-service";
export { IPFSFileTransport, configureFileTransport } from "./ipfs-file-transport";
export { AvatarManager, avatarManager, configureAvatarManager } from "./avatar-manager";
export { IPFSPeerAdvertiser, getIPFSPeerAdvertiser } from "./ipfs-peer-advertiser";

// Node management
export { NodeManager, migrateMemberRoles } from "./node-manager";
export { RoleManager, roleManager } from "./role-manager";
export { ModerationManager, getModerationManager } from "./moderation-manager";
export { DirectoryManager, directoryManager } from "./directory-manager";

// Direct Messages
export { DMManager } from "./dm-manager";

// Social / Friends
export { SocialManager, generateRequestId } from "./social-manager";

// Voice (Milestone 2.4)
export { MeshVoiceTransport, LiveKitVoiceTransport, VoiceManager } from "./voice";
