// Transport Abstraction Layer (TAL) — Core Interfaces
// Protocol-agnostic interfaces that decouple the app from any specific P2P technology.
// See Architecture Spec Section 2.3

import type { UserStatus } from "@nodes/core";

// ── Callback Types ──

export type Unsubscribe = () => void;
export type MessageHandler = (message: TransportMessage) => void;
export type PresenceHandler = (presence: PresenceInfo) => void;
export type ConnectionHandler = (state: ConnectionState) => void;

// ── Data Types ──

export interface TransportMessage {
  id: string;
  content: string;
  timestamp: number;
  authorKey: string;
  channelId: string;
  type: "text" | "system" | "file";
  signature?: string; // SEA signature for verification
  editedAt?: number;
  attachments?: string; // JSON-stringified FileAttachment[] (Milestone 2.1)
}

export interface PresenceInfo {
  publicKey: string;
  status: UserStatus;
  lastSeen: number;
  typing?: boolean;
}

// Simple connection status (for backward compatibility)
export type ConnectionStatus = "connected" | "disconnected" | "reconnecting" | "connecting";

// Rich connection state object for detailed monitoring
export interface ConnectionState {
  connected: boolean;
  status: ConnectionStatus;
  peerCount: number;
  lastConnected: number | null;
  reconnectAttempts: number;
}

// Alias for handlers that receive connection state
export type ConnectionStateHandler = ConnectionHandler;

// File transport types
export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  uploadedAt: number;
  uploadedBy: string;
}

export interface UploadProgress {
  fileId: string;
  loaded: number;
  total: number;
  percentage: number;
}

export interface HistoryOpts {
  limit?: number;
  before?: number;
  after?: number;
}

export interface KeyPair {
  pub: string;
  priv: string;
  epub: string;
  epriv: string;
}

export interface Session {
  user: {
    publicKey: string;
    displayName: string;
    status: UserStatus;
    visibility: "public" | "private";
  };
  keypair: KeyPair;
}

// ── Transport Interfaces ──

/**
 * IMessageTransport handles sending, receiving, and retrieving messages.
 * All message operations for channels and DMs go through this interface.
 */
export interface IMessageTransport {
  /** Send a message to a channel. Can pass a string for simple text messages. */
  send(
    channelId: string,
    message: string | Partial<Omit<TransportMessage, "id" | "timestamp" | "signature">>
  ): Promise<TransportMessage>;

  /** Subscribe to real-time messages in a channel */
  subscribe(channelId: string, handler: MessageHandler): Unsubscribe;

  /** Get message history for a channel */
  getHistory(channelId: string, opts?: HistoryOpts): Promise<TransportMessage[]>;

  /** Delete a message by ID (marks as deleted in graph) */
  deleteMessage(channelId: string, messageId: string): Promise<void>;

  /** Edit a message */
  editMessage(
    channelId: string,
    messageId: string,
    newContent: string
  ): Promise<TransportMessage>;
}

/**
 * IPresenceTransport handles user online status and typing indicators.
 */
export interface IPresenceTransport {
  /** Set the current user's status */
  setStatus(status: UserStatus): Promise<void>;

  /** Set typing indicator for a channel */
  setTyping(channelId: string, isTyping: boolean): Promise<void>;

  /** Subscribe to presence changes for a list of users */
  subscribe(publicKeys: string[], handler: PresenceHandler): Unsubscribe;

  /** Subscribe to typing indicators in a channel */
  subscribeTyping(
    channelId: string,
    handler: (publicKey: string, isTyping: boolean) => void
  ): Unsubscribe;

  /** Get current presence for a user */
  getPresence(publicKey: string): Promise<PresenceInfo | null>;

  /** Go offline (call on logout or app close) */
  goOffline(): Promise<void>;
}

/**
 * IAuthProvider handles identity and encryption.
 */
export interface IAuthProvider {
  createIdentity(): Promise<KeyPair>;
  authenticate(keypair: KeyPair): Promise<Session>;
  encrypt(data: string, recipientEpub: string): Promise<string>;
  decrypt(data: string): Promise<string>;
}

/**
 * IFileTransport handles file upload/download.
 * Stubbed for now — full IPFS implementation in Phase 2 (Milestone 2.4).
 */
export interface IFileTransport {
  upload(
    file: File,
    metadata?: Partial<FileMetadata>
  ): Promise<{ fileId: string; metadata: FileMetadata }>;
  download(fileId: string): Promise<Blob>;
  delete(fileId: string): Promise<void>;
  getUrl(fileId: string): string;
  getMetadata?(fileId: string): Promise<FileMetadata | null>;
  onProgress?(fileId: string, handler: (p: UploadProgress) => void): Unsubscribe;
}

/**
 * IConnectionMonitor tracks the state of P2P connections.
 */
export interface IConnectionMonitor {
  /** Get current connection state */
  getState(): ConnectionState;

  /** Subscribe to connection state changes */
  onStateChange(handler: ConnectionHandler): Unsubscribe;

  /** Get the number of connected peers */
  getPeerCount(): number;

  /** Manually trigger reconnection */
  reconnect(): Promise<void>;

  /** Start monitoring */
  start(): void;

  /** Stop monitoring (cleanup) */
  stop(): void;
}
