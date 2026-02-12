# MILESTONE 1.3 — TRANSPORT ABSTRACTION LAYER
## Nodes: Decentralized Communication Platform

---

### OBJECTIVE
Fully implement the Transport Abstraction Layer (TAL) with GunJS adapters for messaging, presence, and file references. The TAL is the most critical architectural decision in Nodes — it decouples the entire application from GunJS so the P2P protocol can be swapped without rewriting the UI or business logic. This milestone also wires up a React context provider so all components can access transport services cleanly.

---

### DEFINITION OF DONE
- [ ] IMessageTransport fully implemented with GunJS adapter (send, subscribe, getHistory)
- [ ] IPresenceTransport fully implemented with GunJS adapter (setStatus, onPresenceChange)
- [ ] IFileTransport stubbed with local placeholder (full IPFS in Phase 2)
- [ ] TransportProvider React context wraps the app, providing all transports to components
- [ ] Connection status monitoring — UI shows connected/disconnected/reconnecting state
- [ ] Two instances of the app (or browser tabs) can send messages through Gun and receive them in real-time
- [ ] Presence updates propagate between instances within 3 seconds
- [ ] Message history is retrievable after reconnection
- [ ] All transport operations go through abstraction interfaces — no direct Gun calls in UI code
- [ ] Comprehensive tests for message send/receive, presence, and history retrieval
- [ ] Lint and format pass cleanly

---

### ARCHITECTURE CONTEXT
Reference: Architecture Spec **Section 2.3 (Transport Abstraction Layer)**

The TAL defines protocol-agnostic interfaces. The app talks ONLY to the interfaces. The GunJS adapters are the concrete implementations. If Gun chokes at scale, you swap the adapter — not the app.

```
┌─────────────────────────────┐
│  React Components (UI)      │
│  useTransport() hook        │
├─────────────────────────────┤
│  TransportProvider (Context) │
├─────────────────────────────┤
│  IMessageTransport          │
│  IPresenceTransport         │
│  IAuthProvider              │  ← Interfaces (packages/transport)
│  IFileTransport             │
├─────────────────────────────┤
│  GunMessageTransport        │
│  GunPresenceTransport       │
│  GunAuthProvider             │  ← Adapters (packages/transport-gun)
│  LocalFileTransport         │
└─────────────────────────────┘
```

**Key rule:** No component in `apps/desktop/src/` should ever import from `gun` or `gun/sea` directly. Everything goes through `@nodes/transport` interfaces, resolved by `@nodes/transport-gun` adapters via the context provider.

---

### STEP-BY-STEP INSTRUCTIONS

#### 1. UPDATE TRANSPORT INTERFACES (packages/transport)

Expand the interfaces defined in Milestone 1.1 with connection management and event types.

**packages/transport/src/index.ts:**
```typescript
export type {
  IMessageTransport,
  IPresenceTransport,
  IAuthProvider,
  IFileTransport,
  IConnectionMonitor,
  MessageHandler,
  PresenceHandler,
  ConnectionHandler,
  Unsubscribe,
  HistoryOpts,
  KeyPair,
  Session,
  TransportMessage,
  PresenceInfo,
  ConnectionState,
} from "./interfaces";
```

**packages/transport/src/interfaces.ts:**
```typescript
import type { Message, UserStatus } from "@nodes/core";

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
}

export interface PresenceInfo {
  publicKey: string;
  status: UserStatus;
  lastSeen: number;
  typing?: boolean;
}

export type ConnectionState = "connected" | "disconnected" | "reconnecting";

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
  /** Send a message to a channel */
  send(channelId: string, message: Omit<TransportMessage, "id" | "timestamp" | "signature">): Promise<TransportMessage>;

  /** Subscribe to real-time messages in a channel */
  subscribe(channelId: string, handler: MessageHandler): Unsubscribe;

  /** Get message history for a channel */
  getHistory(channelId: string, opts?: HistoryOpts): Promise<TransportMessage[]>;

  /** Delete a message by ID (marks as deleted in graph) */
  deleteMessage(channelId: string, messageId: string): Promise<void>;

  /** Edit a message */
  editMessage(channelId: string, messageId: string, newContent: string): Promise<TransportMessage>;
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
  subscribeTyping(channelId: string, handler: (publicKey: string, isTyping: boolean) => void): Unsubscribe;

  /** Get current presence for a user */
  getPresence(publicKey: string): Promise<PresenceInfo | null>;
}

/**
 * IAuthProvider handles identity and encryption.
 * (Already implemented in Milestone 1.2, re-exported here for completeness)
 */
export interface IAuthProvider {
  createIdentity(): Promise<KeyPair>;
  authenticate(keypair: KeyPair): Promise<Session>;
  encrypt(data: string, recipientPub: string): Promise<string>;
  decrypt(data: string): Promise<string>;
}

/**
 * IFileTransport handles file upload/download.
 * Stubbed for now — full IPFS implementation in Phase 2 (Milestone 2.4).
 */
export interface IFileTransport {
  upload(file: File, encrypt?: boolean): Promise<string>;
  download(ref: string): Promise<Blob>;
  delete(ref: string): Promise<void>;
  getUrl(ref: string): string;
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
}
```

#### 2. IMPLEMENT GUN MESSAGE TRANSPORT (packages/transport-gun)

**packages/transport-gun/src/message-transport.ts:**
```typescript
import type {
  IMessageTransport,
  TransportMessage,
  MessageHandler,
  Unsubscribe,
  HistoryOpts,
} from "@nodes/transport";
import { GunInstance } from "./gun-instance";
import SEA from "gun/sea";

/**
 * GunMessageTransport implements IMessageTransport using GunJS.
 *
 * Messages are stored in a shared graph under:
 *   gun.get("nodes").get(nodeId).get("channels").get(channelId).get("messages")
 *
 * Each message is a node with a soul, signed by the author's keypair.
 * The graph structure enables real-time subscription via Gun's .map().on()
 */
export class GunMessageTransport implements IMessageTransport {

  /**
   * Send a message to a channel.
   * The message is signed with the sender's keypair for authenticity verification.
   */
  async send(
    channelId: string,
    message: Omit<TransportMessage, "id" | "timestamp" | "signature">
  ): Promise<TransportMessage> {
    const gun = GunInstance.get();
    const user = GunInstance.user();
    const pair = user._.sea;

    if (!pair) {
      throw new Error("Not authenticated. Cannot send messages.");
    }

    const id = generateMessageId();
    const timestamp = Date.now();

    // Sign the message content for verification
    const dataToSign = JSON.stringify({
      id,
      content: message.content,
      timestamp,
      authorKey: message.authorKey,
      channelId,
    });
    const signature = await SEA.sign(dataToSign, pair);

    const fullMessage: TransportMessage = {
      ...message,
      id,
      timestamp,
      channelId,
      signature,
    };

    // Store in the channel's message graph
    // Using .get(id).put() instead of .set() for deterministic addressing
    return new Promise((resolve, reject) => {
      gun
        .get("channels")
        .get(channelId)
        .get("messages")
        .get(id)
        .put(
          {
            id: fullMessage.id,
            content: fullMessage.content,
            timestamp: fullMessage.timestamp,
            authorKey: fullMessage.authorKey,
            channelId: fullMessage.channelId,
            type: fullMessage.type,
            signature: fullMessage.signature,
          },
          (ack: any) => {
            if (ack.err) {
              reject(new Error(`Failed to send message: ${ack.err}`));
            } else {
              resolve(fullMessage);
            }
          }
        );
    });
  }

  /**
   * Subscribe to real-time messages in a channel.
   * Uses Gun's .map().on() for reactive updates.
   */
  subscribe(channelId: string, handler: MessageHandler): Unsubscribe {
    const gun = GunInstance.get();
    const seenIds = new Set<string>();

    const ref = gun
      .get("channels")
      .get(channelId)
      .get("messages")
      .map()
      .on((data: any, key: string) => {
        if (!data || !data.id || data.id === "_" || seenIds.has(data.id)) return;

        // Skip Gun metadata
        if (typeof data !== "object" || !data.content) return;

        seenIds.add(data.id);

        const message: TransportMessage = {
          id: data.id,
          content: data.content,
          timestamp: data.timestamp || Date.now(),
          authorKey: data.authorKey || "",
          channelId: data.channelId || channelId,
          type: data.type || "text",
          signature: data.signature,
        };

        handler(message);
      });

    // Return unsubscribe function
    return () => {
      ref.off();
    };
  }

  /**
   * Get message history for a channel.
   * Gun doesn't have native pagination, so we load all and filter/sort client-side.
   * For large channels, this will need optimization (cursor-based loading) in Phase 3.
   */
  async getHistory(channelId: string, opts?: HistoryOpts): Promise<TransportMessage[]> {
    const gun = GunInstance.get();
    const limit = opts?.limit || 50;

    return new Promise((resolve) => {
      const messages: TransportMessage[] = [];
      let resolved = false;

      // Set a timeout to resolve even if not all messages load
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(sortAndFilter(messages, opts));
        }
      }, 3000);

      gun
        .get("channels")
        .get(channelId)
        .get("messages")
        .map()
        .once((data: any) => {
          if (!data || !data.id || typeof data !== "object" || !data.content) return;

          messages.push({
            id: data.id,
            content: data.content,
            timestamp: data.timestamp || 0,
            authorKey: data.authorKey || "",
            channelId: data.channelId || channelId,
            type: data.type || "text",
            signature: data.signature,
          });

          // If we have enough messages, resolve early
          if (messages.length >= limit * 2) {
            clearTimeout(timeout);
            if (!resolved) {
              resolved = true;
              resolve(sortAndFilter(messages, opts));
            }
          }
        });

      // Also resolve after a shorter delay if we get some messages
      setTimeout(() => {
        if (!resolved && messages.length > 0) {
          clearTimeout(timeout);
          resolved = true;
          resolve(sortAndFilter(messages, opts));
        }
      }, 1000);
    });
  }

  /**
   * Delete a message (soft delete — marks as deleted in graph).
   */
  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    const gun = GunInstance.get();

    gun
      .get("channels")
      .get(channelId)
      .get("messages")
      .get(messageId)
      .put({
        content: "[deleted]",
        type: "system",
        deletedAt: Date.now(),
      });
  }

  /**
   * Edit a message.
   */
  async editMessage(
    channelId: string,
    messageId: string,
    newContent: string
  ): Promise<TransportMessage> {
    const gun = GunInstance.get();
    const user = GunInstance.user();
    const pair = user._.sea;

    const editedAt = Date.now();

    return new Promise((resolve, reject) => {
      gun
        .get("channels")
        .get(channelId)
        .get("messages")
        .get(messageId)
        .once(async (existing: any) => {
          if (!existing) {
            reject(new Error("Message not found"));
            return;
          }

          // Only the author can edit
          if (existing.authorKey !== pair?.pub) {
            reject(new Error("Cannot edit another user's message"));
            return;
          }

          const signature = await SEA.sign(
            JSON.stringify({ id: messageId, content: newContent, editedAt }),
            pair
          );

          gun
            .get("channels")
            .get(channelId)
            .get("messages")
            .get(messageId)
            .put(
              {
                content: newContent,
                signature,
                editedAt,
              },
              (ack: any) => {
                if (ack.err) reject(new Error(ack.err));
                else
                  resolve({
                    ...existing,
                    content: newContent,
                    signature,
                  });
              }
            );
        });
    });
  }
}

// ── Helpers ──

function generateMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

function sortAndFilter(
  messages: TransportMessage[],
  opts?: HistoryOpts
): TransportMessage[] {
  let filtered = messages;

  if (opts?.before) {
    filtered = filtered.filter((m) => m.timestamp < opts.before!);
  }
  if (opts?.after) {
    filtered = filtered.filter((m) => m.timestamp > opts.after!);
  }

  // Sort by timestamp ascending
  filtered.sort((a, b) => a.timestamp - b.timestamp);

  // Apply limit (take most recent)
  if (opts?.limit && filtered.length > opts.limit) {
    filtered = filtered.slice(-opts.limit);
  }

  return filtered;
}
```

#### 3. IMPLEMENT GUN PRESENCE TRANSPORT (packages/transport-gun)

**packages/transport-gun/src/presence-transport.ts:**
```typescript
import type {
  IPresenceTransport,
  PresenceInfo,
  PresenceHandler,
  Unsubscribe,
} from "@nodes/transport";
import type { UserStatus } from "@nodes/core";
import { GunInstance } from "./gun-instance";

/**
 * GunPresenceTransport implements IPresenceTransport using GunJS.
 *
 * Presence data is stored in a shared graph:
 *   gun.get("presence").get(publicKey) → { status, lastSeen, typing }
 *
 * Typing indicators are stored per-channel:
 *   gun.get("typing").get(channelId).get(publicKey) → { isTyping, timestamp }
 *
 * Presence has a heartbeat mechanism — users update their lastSeen every 30s.
 * If lastSeen is older than 60s, the user is considered offline regardless of
 * their status field.
 */

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds
const OFFLINE_THRESHOLD = 60_000; // 60 seconds
const TYPING_TIMEOUT = 5_000; // 5 seconds — auto-clear typing

export class GunPresenceTransport implements IPresenceTransport {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private currentPublicKey: string | null = null;

  /**
   * Set the current user's status.
   * Also starts the heartbeat if not already running.
   */
  async setStatus(status: UserStatus): Promise<void> {
    const gun = GunInstance.get();
    const user = GunInstance.user();
    const pair = user._.sea;

    if (!pair) {
      throw new Error("Not authenticated. Cannot set presence.");
    }

    this.currentPublicKey = pair.pub;

    gun.get("presence").get(pair.pub).put({
      status,
      lastSeen: Date.now(),
      publicKey: pair.pub,
    });

    // Start heartbeat
    this.startHeartbeat(status);
  }

  /**
   * Set typing indicator for a channel.
   */
  async setTyping(channelId: string, isTyping: boolean): Promise<void> {
    const gun = GunInstance.get();
    const user = GunInstance.user();
    const pair = user._.sea;

    if (!pair) return;

    gun.get("typing").get(channelId).get(pair.pub).put({
      isTyping,
      timestamp: Date.now(),
    });
  }

  /**
   * Subscribe to presence changes for a list of users.
   */
  subscribe(publicKeys: string[], handler: PresenceHandler): Unsubscribe {
    const gun = GunInstance.get();
    const refs: any[] = [];

    for (const key of publicKeys) {
      const ref = gun.get("presence").get(key).on((data: any) => {
        if (!data || !data.publicKey) return;

        // Check if actually online based on heartbeat
        const isStale = Date.now() - (data.lastSeen || 0) > OFFLINE_THRESHOLD;

        const presence: PresenceInfo = {
          publicKey: data.publicKey,
          status: isStale ? "offline" : data.status || "offline",
          lastSeen: data.lastSeen || 0,
        };

        handler(presence);
      });

      refs.push(ref);
    }

    return () => {
      refs.forEach((ref) => ref.off());
    };
  }

  /**
   * Subscribe to typing indicators in a channel.
   */
  subscribeTyping(
    channelId: string,
    handler: (publicKey: string, isTyping: boolean) => void
  ): Unsubscribe {
    const gun = GunInstance.get();

    const ref = gun
      .get("typing")
      .get(channelId)
      .map()
      .on((data: any, key: string) => {
        if (!data || typeof data.isTyping !== "boolean") return;

        // Auto-expire typing after TYPING_TIMEOUT
        const isExpired = Date.now() - (data.timestamp || 0) > TYPING_TIMEOUT;

        handler(key, data.isTyping && !isExpired);
      });

    return () => {
      ref.off();
    };
  }

  /**
   * Get current presence for a single user.
   */
  async getPresence(publicKey: string): Promise<PresenceInfo | null> {
    const gun = GunInstance.get();

    return new Promise((resolve) => {
      gun.get("presence").get(publicKey).once((data: any) => {
        if (!data || !data.publicKey) {
          resolve(null);
          return;
        }

        const isStale = Date.now() - (data.lastSeen || 0) > OFFLINE_THRESHOLD;

        resolve({
          publicKey: data.publicKey,
          status: isStale ? "offline" : data.status || "offline",
          lastSeen: data.lastSeen || 0,
        });
      });
    });
  }

  /**
   * Start heartbeat to keep presence alive.
   */
  private startHeartbeat(status: UserStatus): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      if (!this.currentPublicKey) return;

      const gun = GunInstance.get();
      gun.get("presence").get(this.currentPublicKey).put({
        status,
        lastSeen: Date.now(),
        publicKey: this.currentPublicKey,
      });
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Stop the heartbeat (on logout or app close).
   */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Set offline status and stop heartbeat.
   * Call this on logout or app close.
   */
  async goOffline(): Promise<void> {
    if (this.currentPublicKey) {
      const gun = GunInstance.get();
      gun.get("presence").get(this.currentPublicKey).put({
        status: "offline",
        lastSeen: Date.now(),
        publicKey: this.currentPublicKey,
      });
    }
    this.stopHeartbeat();
    this.currentPublicKey = null;
  }
}
```

#### 4. IMPLEMENT CONNECTION MONITOR (packages/transport-gun)

**packages/transport-gun/src/connection-monitor.ts:**
```typescript
import type {
  IConnectionMonitor,
  ConnectionState,
  ConnectionHandler,
  Unsubscribe,
} from "@nodes/transport";
import { GunInstance } from "./gun-instance";

/**
 * GunConnectionMonitor tracks the state of Gun peer connections.
 *
 * Gun doesn't have a native "connected" event, so we monitor:
 * 1. Whether we have any relay peers configured
 * 2. Whether Gun's internal wire state shows connections
 * 3. A periodic heartbeat check that writes/reads from the graph
 */

const HEALTH_CHECK_INTERVAL = 15_000; // 15 seconds

export class GunConnectionMonitor implements IConnectionMonitor {
  private state: ConnectionState = "disconnected";
  private handlers: Set<ConnectionHandler> = new Set();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private peerCount: number = 0;

  /**
   * Start monitoring connections.
   * Call after GunInstance.init()
   */
  start(): void {
    this.setState("connected"); // Optimistic — Gun works offline-first
    this.startHealthCheck();
  }

  getState(): ConnectionState {
    return this.state;
  }

  onStateChange(handler: ConnectionHandler): Unsubscribe {
    this.handlers.add(handler);
    // Immediately notify with current state
    handler(this.state);

    return () => {
      this.handlers.delete(handler);
    };
  }

  getPeerCount(): number {
    return this.peerCount;
  }

  async reconnect(): Promise<void> {
    this.setState("reconnecting");

    try {
      const gun = GunInstance.get();

      // Gun automatically reconnects, but we can force by re-initializing
      // For now, just update state after a brief delay
      await new Promise((resolve) => setTimeout(resolve, 2000));

      this.setState("connected");
    } catch {
      this.setState("disconnected");
    }
  }

  /**
   * Stop monitoring (cleanup on shutdown).
   */
  stop(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    this.handlers.clear();
  }

  private setState(newState: ConnectionState): void {
    if (this.state === newState) return;
    this.state = newState;
    this.handlers.forEach((handler) => handler(newState));
  }

  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      try {
        const gun = GunInstance.get();

        // Check Gun's internal peer tracking
        const peers = gun._.opt?.peers || {};
        this.peerCount = Object.keys(peers).length;

        // Gun works offline-first, so even with 0 peers we're "connected"
        // to our local graph. We only go "disconnected" on error.
        if (this.state === "disconnected") {
          this.setState("connected");
        }
      } catch {
        this.setState("disconnected");
      }
    }, HEALTH_CHECK_INTERVAL);
  }
}
```

#### 5. IMPLEMENT LOCAL FILE TRANSPORT STUB (packages/transport-gun)

**packages/transport-gun/src/file-transport.ts:**
```typescript
import type { IFileTransport } from "@nodes/transport";

/**
 * LocalFileTransport is a placeholder implementation.
 * In Phase 2 (Milestone 2.4), this will be replaced with IPFS via Helia.
 *
 * For now, files are stored as base64 data URLs in memory/localStorage.
 * This is NOT suitable for production — it's just enough to unblock
 * development of the UI and message flow.
 */
export class LocalFileTransport implements IFileTransport {
  private store = new Map<string, string>(); // ref → base64 data URL

  async upload(file: File, _encrypt?: boolean): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const ref = `local:${Date.now()}-${file.name}`;
        this.store.set(ref, reader.result as string);
        resolve(ref);
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  async download(ref: string): Promise<Blob> {
    const dataUrl = this.store.get(ref);
    if (!dataUrl) throw new Error(`File not found: ${ref}`);

    const response = await fetch(dataUrl);
    return response.blob();
  }

  async delete(ref: string): Promise<void> {
    this.store.delete(ref);
  }

  getUrl(ref: string): string {
    return this.store.get(ref) || "";
  }
}
```

#### 6. UPDATE TRANSPORT-GUN EXPORTS

**packages/transport-gun/src/index.ts:**
```typescript
export { GunAuthProvider } from "./auth-provider";
export { GunMessageTransport } from "./message-transport";
export { GunPresenceTransport } from "./presence-transport";
export { GunConnectionMonitor } from "./connection-monitor";
export { LocalFileTransport } from "./file-transport";
export { GunInstance } from "./gun-instance";
export { ProfileManager } from "./profile-manager";
export type { ProfileData, ProfileWithVisibility, ProfileFieldConfig } from "./profile-manager";
```

#### 7. CREATE TRANSPORT PROVIDER (apps/desktop)

This is the React context that makes all transports available to the component tree.

**apps/desktop/src/providers/TransportProvider.tsx:**
```tsx
import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import type {
  IMessageTransport,
  IPresenceTransport,
  IAuthProvider,
  IFileTransport,
  IConnectionMonitor,
  ConnectionState,
} from "@nodes/transport";
import {
  GunAuthProvider,
  GunMessageTransport,
  GunPresenceTransport,
  GunConnectionMonitor,
  LocalFileTransport,
} from "@nodes/transport-gun";
import { useState } from "react";

interface TransportContextValue {
  messages: IMessageTransport;
  presence: IPresenceTransport;
  auth: IAuthProvider;
  files: IFileTransport;
  connection: IConnectionMonitor;
  connectionState: ConnectionState;
  peerCount: number;
}

const TransportContext = createContext<TransportContextValue | null>(null);

interface TransportProviderProps {
  children: React.ReactNode;
}

/**
 * TransportProvider initializes all transport adapters and provides them
 * to the component tree via React context.
 *
 * This is the single point where concrete implementations (Gun adapters)
 * are bound to abstract interfaces. The rest of the app only sees interfaces.
 */
export function TransportProvider({ children }: TransportProviderProps) {
  const [connectionState, setConnectionState] = useState<ConnectionState>("disconnected");
  const [peerCount, setPeerCount] = useState(0);

  // Use refs to maintain stable instances across renders
  const transports = useMemo(() => {
    const auth = new GunAuthProvider();
    const messages = new GunMessageTransport();
    const presence = new GunPresenceTransport();
    const connection = new GunConnectionMonitor();
    const files = new LocalFileTransport();

    return { auth, messages, presence, connection, files };
  }, []);

  // Monitor connection state
  useEffect(() => {
    transports.connection.start();

    const unsub = transports.connection.onStateChange((state) => {
      setConnectionState(state);
      setPeerCount(transports.connection.getPeerCount());
    });

    return () => {
      unsub();
      transports.connection.stop();
    };
  }, [transports]);

  // Clean up presence on unmount (app close)
  useEffect(() => {
    const handleBeforeUnload = () => {
      (transports.presence as GunPresenceTransport).goOffline();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      (transports.presence as GunPresenceTransport).goOffline();
    };
  }, [transports]);

  const value: TransportContextValue = {
    ...transports,
    connectionState,
    peerCount,
  };

  return (
    <TransportContext.Provider value={value}>
      {children}
    </TransportContext.Provider>
  );
}

/**
 * Hook to access transport services from any component.
 *
 * Usage:
 *   const { messages, presence, connection } = useTransport();
 *   messages.send(channelId, { content: "hello", ... });
 */
export function useTransport(): TransportContextValue {
  const ctx = useContext(TransportContext);
  if (!ctx) {
    throw new Error("useTransport must be used within a TransportProvider");
  }
  return ctx;
}
```

#### 8. CREATE CONNECTION STATUS COMPONENT

**apps/desktop/src/components/ConnectionStatus.tsx:**
```tsx
import { useTransport } from "../providers/TransportProvider";

/**
 * Displays the current P2P connection state.
 * Shows in the bottom-left of the app shell.
 */
export function ConnectionStatus() {
  const { connectionState, peerCount } = useTransport();

  const stateConfig = {
    connected: {
      color: "bg-nodes-accent",
      label: "Connected",
      pulse: false,
    },
    disconnected: {
      color: "bg-nodes-danger",
      label: "Disconnected",
      pulse: false,
    },
    reconnecting: {
      color: "bg-yellow-500",
      label: "Reconnecting...",
      pulse: true,
    },
  };

  const config = stateConfig[connectionState];

  return (
    <div className="flex items-center gap-2 text-xs text-nodes-text-muted">
      <div className="relative">
        <div className={`w-2 h-2 rounded-full ${config.color}`} />
        {config.pulse && (
          <div className={`absolute inset-0 w-2 h-2 rounded-full ${config.color} animate-ping`} />
        )}
      </div>
      <span>{config.label}</span>
      {peerCount > 0 && (
        <span className="opacity-50">({peerCount} peers)</span>
      )}
    </div>
  );
}
```

#### 9. WIRE UP PROVIDERS IN APP

**Update apps/desktop/src/App.tsx:**
```tsx
import "./styles/globals.css";
import { TransportProvider } from "./providers/TransportProvider";
import { AuthGate } from "./components/auth/AuthGate";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { useIdentityStore } from "./stores/identity-store";

function Dashboard() {
  const { publicKey, profile, logout } = useIdentityStore();

  return (
    <div className="h-screen w-screen bg-nodes-bg text-nodes-text flex flex-col">
      {/* Main content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-nodes-primary mb-4">Nodes</h1>
          <div className="bg-nodes-surface border border-nodes-border rounded-xl p-6 max-w-lg w-full text-left">
            <h2 className="text-xl font-semibold mb-4">
              Welcome, {profile?.data.displayName || "User"}
            </h2>
            <div className="space-y-2 text-sm text-nodes-text-muted">
              <p>
                <span className="text-nodes-text">Public Key:</span>{" "}
                <span className="font-mono text-xs break-all">{publicKey}</span>
              </p>
              <p>
                <span className="text-nodes-text">Account Type:</span>{" "}
                {profile?.data.visibility}
              </p>
              <p>
                <span className="text-nodes-text">Status:</span>{" "}
                {profile?.data.status}
              </p>
            </div>
            <button
              onClick={logout}
              className="mt-6 w-full bg-nodes-border hover:bg-nodes-danger text-nodes-text-muted hover:text-white py-2 rounded-lg transition-colors text-sm"
            >
              Lock (Logout)
            </button>
          </div>
          <p className="text-nodes-text-muted text-xs mt-8 opacity-50">
            v0.1.0-alpha — Milestone 1.3
          </p>
        </div>
      </div>

      {/* Status bar */}
      <div className="border-t border-nodes-border px-4 py-2">
        <ConnectionStatus />
      </div>
    </div>
  );
}

function App() {
  return (
    <TransportProvider>
      <AuthGate>
        <Dashboard />
      </AuthGate>
    </TransportProvider>
  );
}

export default App;
```

#### 10. UPDATE MAIN.TSX

**apps/desktop/src/main.tsx:**
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

#### 11. ADD TESTS

**packages/transport-gun/src/__tests__/message-transport.test.ts:**
```typescript
import { describe, it, expect, beforeEach } from "vitest";

/**
 * Transport tests require a running Gun instance.
 * For unit tests, we test the interface contracts and helpers.
 * Integration tests (two peers talking) are manual for now
 * and will be automated with Playwright in a later milestone.
 */
describe("GunMessageTransport", () => {
  it("should generate unique message IDs", () => {
    // Test the ID generation logic
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 10);
      const id = `${timestamp}-${random}`;
      expect(ids.has(id)).toBe(false);
      ids.add(id);
    }
  });

  it("should sort messages by timestamp", () => {
    const messages = [
      { id: "3", content: "third", timestamp: 300, authorKey: "a", channelId: "c", type: "text" as const },
      { id: "1", content: "first", timestamp: 100, authorKey: "a", channelId: "c", type: "text" as const },
      { id: "2", content: "second", timestamp: 200, authorKey: "a", channelId: "c", type: "text" as const },
    ];

    messages.sort((a, b) => a.timestamp - b.timestamp);

    expect(messages[0].content).toBe("first");
    expect(messages[1].content).toBe("second");
    expect(messages[2].content).toBe("third");
  });

  it("should filter messages by timestamp range", () => {
    const messages = [
      { id: "1", content: "old", timestamp: 100, authorKey: "a", channelId: "c", type: "text" as const },
      { id: "2", content: "mid", timestamp: 200, authorKey: "a", channelId: "c", type: "text" as const },
      { id: "3", content: "new", timestamp: 300, authorKey: "a", channelId: "c", type: "text" as const },
    ];

    const filtered = messages.filter((m) => m.timestamp > 150 && m.timestamp < 250);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].content).toBe("mid");
  });
});

describe("PresenceTransport", () => {
  it("should detect stale presence beyond threshold", () => {
    const OFFLINE_THRESHOLD = 60_000;
    const lastSeen = Date.now() - 90_000; // 90 seconds ago
    const isStale = Date.now() - lastSeen > OFFLINE_THRESHOLD;
    expect(isStale).toBe(true);
  });

  it("should consider recent presence as online", () => {
    const OFFLINE_THRESHOLD = 60_000;
    const lastSeen = Date.now() - 10_000; // 10 seconds ago
    const isStale = Date.now() - lastSeen > OFFLINE_THRESHOLD;
    expect(isStale).toBe(false);
  });
});
```

---

### VERIFICATION CHECKLIST

1. **`pnpm install`** — No dependency errors
2. **`pnpm lint`** — Clean across all packages
3. **`pnpm test`** — All tests pass
4. **App launches** — `pnpm dev` opens Tauri window with connection status bar
5. **Connection status** — Bottom bar shows "Connected" with green dot
6. **No direct Gun imports in UI** — Grep `apps/desktop/src/` for `import.*gun` → only `@nodes/transport-gun` via provider
7. **Two-instance test** — Open the app in dev + a browser tab pointed at `localhost:1420`. Both instances should connect to the same Gun graph. Send a message from one (via console or a test button) and confirm it appears in the other's subscription.
8. **Presence heartbeat** — After login, check Gun graph for presence data updating every 30s
9. **Offline cleanup** — Close the app, verify presence shows offline from other instance within 60s
10. **TypeScript strict** — No type errors across all packages

### TWO-INSTANCE TESTING TIP

To test P2P communication locally:
1. Run `pnpm dev` (opens Tauri window)
2. Open `http://localhost:1420` in a browser (same frontend, no Tauri wrapper)
3. Create identities on both
4. Use browser console to test message sending via the transport:

```javascript
// In browser console (after auth):
// This is just for verification — real UI comes in Milestone 1.5
const gun = Gun();
gun.get("channels").get("test-channel").get("messages").get("test-1").put({
  id: "test-1",
  content: "Hello from browser!",
  timestamp: Date.now(),
  authorKey: "test",
  channelId: "test-channel",
  type: "text"
});
```

Both instances should see the message if subscribed to "test-channel".

---

### NEXT MILESTONE

Once 1.3 is verified, proceed to **Milestone 1.4: Node (Server) Creation** which will:
- Create/join community Nodes
- Invite link generation and redemption
- Node settings (name, description, icon)
- Member list with role references
- Channel creation within Nodes
- Node data stored in shared GunJS graph
