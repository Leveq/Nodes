// Transport Abstraction Layer (TAL)
// Protocol-agnostic interfaces that decouple the app from any specific P2P technology.
// See Architecture Spec Section 2.3

export type {
  IMessageTransport,
  IPresenceTransport,
  IAuthProvider,
  IFileTransport,
  IVoiceTransport,
  IConnectionMonitor,
  MessageHandler,
  PresenceHandler,
  ConnectionHandler,
  ConnectionStateHandler,
  Unsubscribe,
  HistoryOpts,
  KeyPair,
  Session,
  TransportMessage,
  PresenceInfo,
  ConnectionState,
  ConnectionStatus,
  FileMetadata,
  UploadProgress,
  // Reactions (Milestone 2.2)
  ReactionData,
  MessageReactions,
} from "./interfaces";

