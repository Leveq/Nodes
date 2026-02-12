# MILESTONE 1.6 — DIRECT MESSAGES
## Nodes: Decentralized Communication Platform

---

### OBJECTIVE
Implement end-to-end encrypted direct messages between users. DMs use ECDH key exchange (SEA.secret) to derive a shared secret between two users — only the sender and recipient can read the messages. No relay, no server, no Node owner can see DM content. This milestone also introduces the DM sidebar section and conversation management.

---

### DEFINITION OF DONE
- [ ] User can initiate a DM with any user they share a Node with (click member → "Send Message")
- [ ] User can initiate a DM by entering a public key directly
- [ ] DM messages are end-to-end encrypted using ECDH shared secret (SEA.secret)
- [ ] Messages are encrypted before being written to the Gun graph
- [ ] Messages are decrypted client-side on read
- [ ] DM conversation list appears in a dedicated sidebar section
- [ ] Conversations show the other user's display name, last message preview, and timestamp
- [ ] Unread indicators on DM conversations
- [ ] Reuses existing MessageList, MessageInput, MessageGroup, TypingIndicator components
- [ ] DM messages support the same features as channel messages (grouping, timestamps, multi-line)
- [ ] Typing indicators work in DMs
- [ ] User can switch between Node channels and DMs seamlessly
- [ ] DM conversations persist across sessions (conversation list stored in user graph)
- [ ] Empty DM state: "No conversations yet. Start one by clicking a member's name."
- [ ] Tests for encryption/decryption, conversation creation, and message flow

---

### ARCHITECTURE CONTEXT
Reference: Architecture Spec **Section 2.6 (Security & Encryption)**

**E2E Encryption Flow:**
```
Alice wants to DM Bob:

1. Alice has: { pub, priv, epub, epriv }  (her keypair)
2. Bob has:   { pub, priv, epub, epriv }  (his keypair)

3. Alice computes: sharedSecret = SEA.secret(Bob.epub, Alice.keypair)
4. Bob computes:   sharedSecret = SEA.secret(Alice.epub, Bob.keypair)

   → Both derive the SAME shared secret (ECDH)

5. Alice encrypts: encrypted = SEA.encrypt(message, sharedSecret)
6. Alice writes encrypted message to Gun graph
7. Bob reads encrypted message from Gun graph
8. Bob decrypts: message = SEA.decrypt(encrypted, sharedSecret)
```

**DM Graph Structure:**
```
gun.get("dms").get(conversationId).get("messages").get(messageId) → {
  id, encrypted (encrypted content), timestamp, authorKey,
  conversationId, type, signature
}

gun.get("dms").get(conversationId).get("meta") → {
  participants: [publicKeyA, publicKeyB],
  createdAt, lastMessageAt
}
```

**Conversation ID** is deterministic — derived from both participants' public keys sorted alphabetically, then hashed. This ensures both users compute the same conversation ID regardless of who initiates:
```
conversationId = hash(sort([pubKeyA, pubKeyB]).join(":"))
```

**User's DM List** (stored in user's own graph):
```
gun.user().get("dms").get(conversationId) → {
  conversationId, recipientKey, startedAt, lastReadAt
}
```

---

### STEP-BY-STEP INSTRUCTIONS

#### 1. ADD DM TYPES TO CORE PACKAGE

**Update packages/core/src/index.ts** — add:

```typescript
// ── Direct Message Types ──

export interface DMConversation {
  id: string; // Deterministic from participant keys
  recipientKey: string; // The OTHER user's public key
  recipientName?: string; // Resolved display name
  startedAt: number;
  lastMessageAt: number;
  lastMessagePreview: string; // Truncated last message (decrypted)
  unreadCount: number;
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
```

#### 2. IMPLEMENT DM CRYPTO UTILITIES (packages/crypto)

**packages/crypto/src/dm-crypto.ts:**
```typescript
import SEA from "gun/sea";
import type { KeyPair } from "./types";

/**
 * DMCrypto handles encryption/decryption for direct messages.
 *
 * Uses ECDH key exchange: both parties derive the same shared secret
 * from their own private key and the other's public encryption key (epub).
 * This shared secret is used to encrypt/decrypt all messages in the conversation.
 *
 * The shared secret is deterministic — it never changes for a given pair of users.
 * Cache it per-conversation to avoid recomputing on every message.
 */
export class DMCrypto {
  private secretCache = new Map<string, string>();

  /**
   * Derive the shared secret for a DM conversation.
   * This is the symmetric key used to encrypt/decrypt all messages.
   *
   * @param recipientEpub - The recipient's public encryption key (epub)
   * @param senderKeypair - The sender's full keypair
   * @returns The shared secret string
   */
  async getSharedSecret(
    recipientEpub: string,
    senderKeypair: KeyPair
  ): Promise<string> {
    const cacheKey = `${recipientEpub}:${senderKeypair.epub}`;

    if (this.secretCache.has(cacheKey)) {
      return this.secretCache.get(cacheKey)!;
    }

    const secret = await SEA.secret(recipientEpub, senderKeypair);
    if (!secret) {
      throw new Error("Failed to derive shared secret");
    }

    this.secretCache.set(cacheKey, secret);
    return secret;
  }

  /**
   * Encrypt a message for a DM conversation.
   */
  async encryptMessage(
    content: string,
    recipientEpub: string,
    senderKeypair: KeyPair
  ): Promise<string> {
    const secret = await this.getSharedSecret(recipientEpub, senderKeypair);
    return SEA.encrypt(content, secret);
  }

  /**
   * Decrypt a DM message.
   */
  async decryptMessage(
    encrypted: string,
    recipientEpub: string,
    myKeypair: KeyPair
  ): Promise<string> {
    const secret = await this.getSharedSecret(recipientEpub, myKeypair);
    const result = await SEA.decrypt(encrypted, secret);

    if (result === undefined || result === null) {
      throw new Error("Failed to decrypt message. Wrong key?");
    }

    return result;
  }

  /**
   * Generate a deterministic conversation ID from two public keys.
   * Both participants will compute the same ID.
   */
  static generateConversationId(pubKeyA: string, pubKeyB: string): string {
    const sorted = [pubKeyA, pubKeyB].sort();
    return hashString(sorted.join(":"));
  }

  /**
   * Clear the secret cache (on logout).
   */
  clearCache(): void {
    this.secretCache.clear();
  }
}

/**
 * Simple string hash for conversation IDs.
 * Not cryptographic — just deterministic and collision-resistant enough for IDs.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Convert to base36 and prefix for readability
  return `dm-${Math.abs(hash).toString(36)}`;
}
```

**Update packages/crypto/src/index.ts:**
```typescript
export { KeyManager } from "./key-manager";
export { ProfileCrypto } from "./profile-crypto";
export { DMCrypto } from "./dm-crypto";
export type { EncryptedKeystore, KeyPair, KeyBackup } from "./types";
```

#### 3. IMPLEMENT DM MANAGER (packages/transport-gun)

**packages/transport-gun/src/dm-manager.ts:**
```typescript
import { GunInstance } from "./gun-instance";
import { DMCrypto } from "@nodes/crypto";
import type { KeyPair } from "@nodes/crypto";
import type { DMConversation, DMMessage } from "@nodes/core";
import type { TransportMessage, MessageHandler, Unsubscribe } from "@nodes/transport";
import SEA from "gun/sea";

/**
 * DMManager handles direct message operations.
 *
 * Key differences from channel messages:
 * 1. All content is E2E encrypted with ECDH shared secret
 * 2. Conversation IDs are deterministic from participant keys
 * 3. Conversation metadata is stored in BOTH users' graphs
 * 4. Messages are stored in a shared "dms" graph (encrypted)
 */
export class DMManager {
  private crypto: DMCrypto;

  constructor() {
    this.crypto = new DMCrypto();
  }

  /**
   * Start or get an existing DM conversation with a user.
   * Creates conversation metadata in both users' graphs if it doesn't exist.
   */
  async startConversation(
    recipientKey: string,
    myKeypair: KeyPair
  ): Promise<string> {
    const conversationId = DMCrypto.generateConversationId(
      myKeypair.pub,
      recipientKey
    );

    const gun = GunInstance.get();
    const user = GunInstance.user();
    const now = Date.now();

    // Store conversation metadata in shared graph
    gun.get("dms").get(conversationId).get("meta").put({
      participantA: [myKeypair.pub, recipientKey].sort()[0],
      participantB: [myKeypair.pub, recipientKey].sort()[1],
      createdAt: now,
      lastMessageAt: now,
    });

    // Add to my DM list
    user.get("dms").get(conversationId).put({
      conversationId,
      recipientKey,
      startedAt: now,
      lastReadAt: now,
    });

    return conversationId;
  }

  /**
   * Send an encrypted DM.
   */
  async sendMessage(
    conversationId: string,
    content: string,
    recipientEpub: string,
    myKeypair: KeyPair
  ): Promise<TransportMessage> {
    const gun = GunInstance.get();

    // Encrypt the message content
    const encrypted = await this.crypto.encryptMessage(
      content,
      recipientEpub,
      myKeypair
    );

    const id = generateDMMessageId();
    const timestamp = Date.now();

    // Sign the encrypted payload
    const signature = await SEA.sign(
      JSON.stringify({ id, encrypted, timestamp, authorKey: myKeypair.pub }),
      myKeypair
    );

    const message = {
      id,
      encrypted,
      timestamp,
      authorKey: myKeypair.pub,
      conversationId,
      type: "text",
      signature,
    };

    // Store in DM graph
    return new Promise((resolve, reject) => {
      gun
        .get("dms")
        .get(conversationId)
        .get("messages")
        .get(id)
        .put(message, (ack: any) => {
          if (ack.err) {
            reject(new Error(`Failed to send DM: ${ack.err}`));
            return;
          }

          // Update last message timestamp
          gun.get("dms").get(conversationId).get("meta").put({
            lastMessageAt: timestamp,
          });

          // Return decrypted version for local display
          resolve({
            id,
            content, // Plaintext for local display
            timestamp,
            authorKey: myKeypair.pub,
            channelId: conversationId, // Reuse channelId field for compatibility
            type: "text",
            signature,
          });
        });
    });
  }

  /**
   * Subscribe to real-time DM messages in a conversation.
   * Decrypts each message as it arrives.
   */
  subscribe(
    conversationId: string,
    recipientEpub: string,
    myKeypair: KeyPair,
    handler: MessageHandler
  ): Unsubscribe {
    const gun = GunInstance.get();
    const seenIds = new Set<string>();

    const ref = gun
      .get("dms")
      .get(conversationId)
      .get("messages")
      .map()
      .on(async (data: any) => {
        if (!data || !data.id || seenIds.has(data.id)) return;
        if (typeof data !== "object" || !data.encrypted) return;

        seenIds.add(data.id);

        try {
          // Decrypt the message
          const content = await this.crypto.decryptMessage(
            data.encrypted,
            recipientEpub,
            myKeypair
          );

          const message: TransportMessage = {
            id: data.id,
            content,
            timestamp: data.timestamp || Date.now(),
            authorKey: data.authorKey || "",
            channelId: conversationId,
            type: data.type || "text",
            signature: data.signature,
          };

          handler(message);
        } catch (err) {
          console.error("Failed to decrypt DM:", err);
          // Skip messages we can't decrypt (shouldn't happen in normal flow)
        }
      });

    return () => ref.off();
  }

  /**
   * Get DM message history for a conversation.
   * Decrypts all messages.
   */
  async getHistory(
    conversationId: string,
    recipientEpub: string,
    myKeypair: KeyPair,
    limit: number = 50
  ): Promise<TransportMessage[]> {
    const gun = GunInstance.get();

    return new Promise((resolve) => {
      const messages: TransportMessage[] = [];
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(messages.sort((a, b) => a.timestamp - b.timestamp).slice(-limit));
        }
      }, 3000);

      gun
        .get("dms")
        .get(conversationId)
        .get("messages")
        .map()
        .once(async (data: any) => {
          if (!data || !data.id || typeof data !== "object" || !data.encrypted) return;

          try {
            const content = await this.crypto.decryptMessage(
              data.encrypted,
              recipientEpub,
              myKeypair
            );

            messages.push({
              id: data.id,
              content,
              timestamp: data.timestamp || 0,
              authorKey: data.authorKey || "",
              channelId: conversationId,
              type: data.type || "text",
              signature: data.signature,
            });
          } catch {
            // Skip undecryptable messages
          }
        });

      setTimeout(() => {
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          resolve(messages.sort((a, b) => a.timestamp - b.timestamp).slice(-limit));
        }
      }, 2000);
    });
  }

  /**
   * Get the user's DM conversation list.
   */
  async getConversations(): Promise<DMConversation[]> {
    const user = GunInstance.user();

    return new Promise((resolve) => {
      const conversations: DMConversation[] = [];
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(conversations);
        }
      }, 3000);

      user.get("dms").map().once((data: any) => {
        if (!data || !data.conversationId) return;

        conversations.push({
          id: data.conversationId,
          recipientKey: data.recipientKey || "",
          startedAt: data.startedAt || 0,
          lastMessageAt: data.lastMessageAt || data.startedAt || 0,
          lastMessagePreview: "",
          unreadCount: 0,
        });
      });

      setTimeout(() => {
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          resolve(conversations);
        }
      }, 1500);
    });
  }

  /**
   * Subscribe to changes in the DM conversation list.
   * Useful for detecting new incoming DMs from other users.
   */
  subscribeConversations(
    handler: (conversation: DMConversation) => void
  ): Unsubscribe {
    const user = GunInstance.user();

    const ref = user.get("dms").map().on((data: any) => {
      if (!data || !data.conversationId) return;

      handler({
        id: data.conversationId,
        recipientKey: data.recipientKey || "",
        startedAt: data.startedAt || 0,
        lastMessageAt: data.lastMessageAt || 0,
        lastMessagePreview: "",
        unreadCount: 0,
      });
    });

    return () => ref.off();
  }

  /**
   * Look up a user's epub (encryption public key) from their Gun profile.
   * Needed to derive the shared secret.
   */
  async getRecipientEpub(publicKey: string): Promise<string> {
    const gun = GunInstance.get();

    return new Promise((resolve, reject) => {
      // Gun stores epub in the user's key certificate
      gun.user(publicKey).once((data: any) => {
        if (data && data.epub) {
          resolve(data.epub);
        } else {
          reject(new Error("Could not resolve recipient's encryption key. Are they online?"));
        }
      });

      // Timeout
      setTimeout(() => {
        reject(new Error("Timeout resolving recipient's encryption key."));
      }, 5000);
    });
  }

  /**
   * Mark a conversation as read (update lastReadAt).
   */
  async markAsRead(conversationId: string): Promise<void> {
    const user = GunInstance.user();
    user.get("dms").get(conversationId).put({
      lastReadAt: Date.now(),
    });
  }

  /**
   * Clear crypto caches (call on logout).
   */
  cleanup(): void {
    this.crypto.clearCache();
  }
}

// ── Helpers ──

function generateDMMessageId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `dm-${timestamp}-${random}`;
}
```

**Update packages/transport-gun/src/index.ts:**
```typescript
export { DMManager } from "./dm-manager";
```

#### 4. CREATE DM STORE (apps/desktop)

**apps/desktop/src/stores/dm-store.ts:**
```typescript
import { create } from "zustand";
import { DMManager } from "@nodes/transport-gun";
import { DMCrypto } from "@nodes/crypto";
import type { KeyPair } from "@nodes/crypto";
import type { DMConversation } from "@nodes/core";
import type { TransportMessage, Unsubscribe } from "@nodes/transport";
import { useToastStore } from "./toast-store";

interface DMState {
  // State
  conversations: DMConversation[];
  activeConversationId: string | null;
  messages: Record<string, TransportMessage[]>;
  typingUsers: Record<string, string[]>;
  unreadCounts: Record<string, number>;
  isLoading: boolean;

  // Recipient epub cache (needed for encryption)
  epubCache: Record<string, string>; // publicKey → epub

  // Active subscriptions
  activeMessageSub: Unsubscribe | null;
  activeTypingSub: Unsubscribe | null;

  // Actions
  loadConversations: () => Promise<void>;
  startConversation: (recipientKey: string, keypair: KeyPair) => Promise<string>;
  setActiveConversation: (
    conversationId: string | null,
    recipientKey?: string,
    keypair?: KeyPair
  ) => Promise<void>;
  sendMessage: (
    content: string,
    recipientKey: string,
    keypair: KeyPair
  ) => Promise<void>;
  addMessage: (conversationId: string, message: TransportMessage) => void;
  incrementUnread: (conversationId: string) => void;
  clearUnread: (conversationId: string) => void;
  resolveEpub: (publicKey: string) => Promise<string>;
  cleanup: () => void;
}

const dmManager = new DMManager();

export const useDMStore = create<DMState>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: {},
  typingUsers: {},
  unreadCounts: {},
  isLoading: false,
  epubCache: {},
  activeMessageSub: null,
  activeTypingSub: null,

  loadConversations: async () => {
    try {
      const conversations = await dmManager.getConversations();
      set({ conversations });
    } catch (err: any) {
      useToastStore.getState().addToast("error", `Failed to load DMs: ${err.message}`);
    }
  },

  startConversation: async (recipientKey, keypair) => {
    try {
      // Resolve epub first (validates the recipient exists)
      await get().resolveEpub(recipientKey);

      const conversationId = await dmManager.startConversation(recipientKey, keypair);

      // Add to conversation list if not already there
      set((state) => {
        const exists = state.conversations.some((c) => c.id === conversationId);
        if (exists) return state;

        return {
          conversations: [
            ...state.conversations,
            {
              id: conversationId,
              recipientKey,
              startedAt: Date.now(),
              lastMessageAt: Date.now(),
              lastMessagePreview: "",
              unreadCount: 0,
            },
          ],
        };
      });

      return conversationId;
    } catch (err: any) {
      useToastStore.getState().addToast("error", `Failed to start DM: ${err.message}`);
      throw err;
    }
  },

  setActiveConversation: async (conversationId, recipientKey, keypair) => {
    // Clean up previous subscriptions
    const { activeMessageSub, activeTypingSub } = get();
    if (activeMessageSub) activeMessageSub();
    if (activeTypingSub) activeTypingSub();

    set({
      activeConversationId: conversationId,
      activeMessageSub: null,
      activeTypingSub: null,
    });

    if (!conversationId || !recipientKey || !keypair) return;

    try {
      const epub = await get().resolveEpub(recipientKey);

      // Load history
      const history = await dmManager.getHistory(conversationId, epub, keypair, 50);
      set((state) => ({
        messages: { ...state.messages, [conversationId]: history },
      }));

      // Subscribe to new messages
      const messageSub = dmManager.subscribe(
        conversationId,
        epub,
        keypair,
        (message) => {
          get().addMessage(conversationId, message);
        }
      );

      set({ activeMessageSub: messageSub });

      // Clear unread
      get().clearUnread(conversationId);
      await dmManager.markAsRead(conversationId);
    } catch (err: any) {
      useToastStore.getState().addToast("error", `Failed to load DM: ${err.message}`);
    }
  },

  sendMessage: async (content, recipientKey, keypair) => {
    const { activeConversationId } = get();
    if (!activeConversationId) return;

    try {
      const epub = await get().resolveEpub(recipientKey);

      const message = await dmManager.sendMessage(
        activeConversationId,
        content,
        epub,
        keypair
      );

      // Add to local messages (already decrypted)
      get().addMessage(activeConversationId, message);

      // Update conversation last message
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === activeConversationId
            ? {
                ...c,
                lastMessageAt: Date.now(),
                lastMessagePreview: content.substring(0, 50),
              }
            : c
        ),
      }));
    } catch (err: any) {
      useToastStore.getState().addToast("error", `Failed to send DM: ${err.message}`);
      throw err;
    }
  },

  addMessage: (conversationId, message) => {
    set((state) => {
      const existing = state.messages[conversationId] || [];
      if (existing.some((m) => m.id === message.id)) return state;

      return {
        messages: {
          ...state.messages,
          [conversationId]: [...existing, message].sort(
            (a, b) => a.timestamp - b.timestamp
          ),
        },
      };
    });
  },

  incrementUnread: (conversationId) => {
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [conversationId]: (state.unreadCounts[conversationId] || 0) + 1,
      },
    }));
  },

  clearUnread: (conversationId) => {
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [conversationId]: 0 },
    }));
  },

  resolveEpub: async (publicKey) => {
    const cached = get().epubCache[publicKey];
    if (cached) return cached;

    const epub = await dmManager.getRecipientEpub(publicKey);
    set((state) => ({
      epubCache: { ...state.epubCache, [publicKey]: epub },
    }));
    return epub;
  },

  cleanup: () => {
    const { activeMessageSub, activeTypingSub } = get();
    if (activeMessageSub) activeMessageSub();
    if (activeTypingSub) activeTypingSub();
    dmManager.cleanup();
    set({
      activeConversationId: null,
      activeMessageSub: null,
      activeTypingSub: null,
    });
  },
}));
```

#### 5. BUILD THE DM UI

**Navigation Model:**

The app now has two modes the user can be in:
1. **Node mode** — Viewing a Node's channels (existing)
2. **DM mode** — Viewing direct messages

Add a view mode concept to manage this:

**apps/desktop/src/stores/navigation-store.ts:**
```typescript
import { create } from "zustand";

type ViewMode = "node" | "dm";

interface NavigationState {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}

export const useNavigationStore = create<NavigationState>((set) => ({
  viewMode: "node",
  setViewMode: (mode) => set({ viewMode: mode }),
}));
```

**Update NodeSidebar to include DM icon:**

Add a DM icon above the Node list (or below the separator). Clicking it switches to DM mode:
- Icon: speech bubble or envelope
- When in DM mode, the icon is highlighted/active
- When in Node mode, Node icons are selectable as before

**When in DM mode, the ChannelSidebar transforms into DMSidebar:**

**apps/desktop/src/components/dm/DMSidebar.tsx:**
```
┌──────────────────┐
│ Direct Messages  │
│                  │
│ [Search / New]   │
│                  │
│ ┌──────────────┐ │
│ │ [A] Alice    │ │  ← active conversation highlighted
│ │ Hey, what... │ │  ← last message preview, truncated
│ │      2:30 PM │ │  ← timestamp
│ └──────────────┘ │
│ ┌──────────────┐ │
│ │ [B] Bob   •2 │ │  ← unread badge
│ │ Check this   │ │
│ │  Yesterday   │ │
│ └──────────────┘ │
│                  │
│ + New Message    │
│                  │
└──────────────────┘
```

Each conversation item shows:
- Avatar placeholder (first letter)
- Display name (resolved)
- Last message preview (max ~30 chars, or "No messages yet")
- Relative timestamp
- Unread badge (if > 0)
- Online presence dot

Conversations sorted by lastMessageAt descending (most recent first).

**apps/desktop/src/components/dm/DMView.tsx:**

Similar to ChannelView but uses the DM store:
- Header: recipient's display name + online status
- Reuses MessageList, MessageInput, TypingIndicator
- Messages come from dmStore.messages[conversationId]
- Send goes through dmStore.sendMessage()
- No member sidebar (it's a 1:1 conversation)

**apps/desktop/src/components/dm/NewDMModal.tsx:**

Modal to start a new DM:
- Option 1: Select from members of your current Nodes (dropdown/search)
  - Shows users from ALL Nodes the current user is in
  - Deduplicated (a user who's in multiple shared Nodes appears once)
- Option 2: Enter a public key directly (paste field)
- On select/submit: creates conversation, switches to it

#### 6. ADD "SEND MESSAGE" TO MEMBER LIST

In MemberSidebar, each member should have a context action:
- Right-click or click → shows option "Send Message"
- Clicking it: starts a DM conversation, switches to DM mode, opens the conversation
- Don't show this option for the current user (can't DM yourself)

#### 7. UPDATE APP SHELL

**AppShell.tsx** should now conditionally render based on viewMode:

```typescript
const { viewMode } = useNavigationStore();

// In the sidebar area:
{viewMode === "node" ? <ChannelSidebar /> : <DMSidebar />}

// In the main content area:
{viewMode === "node" ? <ChannelView /> : <DMView />}

// Member sidebar only shows in Node mode:
{viewMode === "node" && <MemberSidebar />}
```

#### 8. HANDLE INCOMING DMS FROM UNKNOWN CONVERSATIONS

When another user starts a DM with us, we need to detect it. Options:

**Approach A (Simple, for now):**
- When in DM mode, periodically poll for new conversations in the user graph
- Or subscribe to the user's "dms" graph for changes

**Approach B (Better, but more complex):**
- The sender writes a reference to the conversation in the recipient's graph
- Requires the recipient's graph to be writable by others (Gun allows this with certain patterns)

**For this milestone, use Approach A:**
- When the user opens DM mode, load conversations from their graph
- If the sender added a conversation entry to the recipient's user graph during startConversation, the recipient will see it on next load
- Note: The sender can't write to the recipient's user graph (it's authenticated)
- Alternative: Store a "dm-request" in the shared graph that the recipient can detect

**Recommended approach for now:**
Both users need to have the conversation in their own graph. When User A starts a DM:
1. User A's `startConversation` stores it in their own graph
2. User A sends the first message to the shared DM graph
3. When User B opens DMs (or we add a periodic check), we scan the shared DM graph for conversations involving User B's public key
4. If found and not in User B's graph yet, add it

Add a method to DMManager:

```typescript
/**
 * Check for incoming DM conversations we don't know about yet.
 * Scans the shared DM graph for conversations involving our public key
 * that aren't in our local list.
 */
async checkForIncomingDMs(myPublicKey: string): Promise<DMConversation[]> {
  // This is a brute-force approach for now.
  // In production, a relay or notification system would handle this.
  // For local testing, the sender manually shares the conversation ID.

  // For the MVP, rely on the user having the conversation in their graph.
  // Incoming DM detection will be improved with relay peers in Phase 2.
  return [];
}
```

**For local testing of DMs:**
Since both users are on the same Gun instance in dev, they can both see the shared DM graph. The simplest flow is:
1. User A starts conversation (gets conversation ID)
2. User A sends message
3. User B starts conversation with User A (computes the SAME conversation ID deterministically)
4. User B's history load picks up User A's messages
5. Both users are now in the same conversation

This works because the conversation ID is deterministic from both public keys.

#### 9. LOAD DMS ON AUTH

When the user authenticates, load their DM conversation list:

```typescript
useEffect(() => {
  if (isAuthenticated) {
    useDMStore.getState().loadConversations();
  }
}, [isAuthenticated]);
```

---

### COMPONENT FILE STRUCTURE

```
apps/desktop/src/
├── components/
│   └── dm/
│       ├── DMSidebar.tsx          # Conversation list sidebar
│       ├── DMConversationItem.tsx  # Single conversation in list
│       ├── DMView.tsx             # Message area for active DM
│       ├── DMHeader.tsx           # Recipient info header
│       └── NewDMModal.tsx         # Start new DM modal
├── stores/
│   ├── dm-store.ts
│   └── navigation-store.ts
```

---

### VERIFICATION CHECKLIST

1. **Start DM from member list** — Right-click member → "Send Message" → switches to DM mode
2. **Start DM via public key** — Click "New Message" in DM sidebar → paste public key → conversation created
3. **Send encrypted message** — Send DM, verify message appears for both users
4. **Verify encryption** — Check Gun graph directly (browser console) → message content is encrypted, unreadable
5. **Decrypt on receive** — Recipient sees plaintext message, not encrypted blob
6. **DM conversation list** — All conversations listed with recipient name, last message preview, timestamp
7. **Conversation persistence** — Close app, reopen, DM conversations still listed
8. **Message history** — Switch away from DM and back, messages reload from history
9. **Unread indicators** — Receive DM while viewing a Node channel, unread badge appears on DM icon/conversation
10. **Message grouping** — Same grouping rules as channel messages work in DMs
11. **Typing indicators** — Typing in DM shows indicator for other user
12. **Switch modes** — Seamlessly switch between Node channels and DMs without state corruption
13. **Deterministic conversation ID** — Both users compute same ID, end up in same conversation
14. **Can't DM self** — "Send Message" option hidden for own entry in member list
15. **`pnpm lint`** — Clean
16. **`pnpm test`** — All tests pass

---

### SECURITY NOTES

- The shared secret is derived from the ECDH key exchange and is never transmitted over the network
- Messages are encrypted BEFORE being written to the Gun graph
- Even if a relay peer caches the DM messages, they cannot decrypt them without one of the participants' private keys
- The conversation ID is a hash, not the raw public keys — it doesn't reveal who is talking to whom (though the authorKey field in each message does reveal the sender within the conversation)
- In a future milestone, consider encrypting the authorKey field as well for full metadata protection

---

### NEXT MILESTONE

Once 1.6 is verified, proceed to **Milestone 1.7: Presence & Profile Polish** which will:
- User profile editing panel (bio, status message, avatar placeholder)
- Status selector dropdown (online/idle/DND/invisible)
- Profile popup on clicking a user's name or avatar
- "About Me" section in profile
- User settings page (change passphrase, export backup, account visibility)
- Enhanced presence indicators throughout the app
