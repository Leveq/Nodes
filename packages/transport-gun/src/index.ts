export { GunAuthProvider } from "./auth-provider";
export { GunInstanceManager } from "./gun-instance";
export { ProfileManager } from "./profile-manager";
export type { ProfileData, ProfileWithVisibility } from "./profile-manager";

// Transport implementations
export { GunMessageTransport } from "./message-transport";
export { GunPresenceTransport } from "./presence-transport";
export { GunConnectionMonitor } from "./connection-monitor";
export { LocalFileTransport } from "./file-transport";

// Node management
export { NodeManager } from "./node-manager";

// Direct Messages
export { DMManager } from "./dm-manager";

// Social / Friends
export { SocialManager, generateRequestId } from "./social-manager";
