import Gun from "gun";
import "gun/sea";
import { GunInstanceManager } from "./gun-instance";
import { DMCrypto } from "@nodes/crypto";
import type { KeyPair } from "@nodes/crypto";
import type { DMConversation } from "@nodes/core";
import type { TransportMessage, MessageHandler, Unsubscribe } from "@nodes/transport";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SEA = Gun.SEA as any;

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

    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();
    const now = Date.now();

    // Store conversation metadata in shared graph and await ack
    const participants = [myKeypair.pub, recipientKey].sort();
    return new Promise((resolve, reject) => {
      gun.get("dms").get(conversationId).get("meta").put(
        {
          participantA: participants[0],
          participantB: participants[1],
          createdAt: now,
          lastMessageAt: now,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ack: any) => {
          if (ack.err) {
            reject(new Error(`Failed to start conversation: ${ack.err}`));
            return;
          }
          // Fire-and-forget the user graph and inbox writes (these are best-effort)
          user.get("dms").get(conversationId).put({
            conversationId,
            recipientKey,
            startedAt: now,
            lastReadAt: now,
          });
          gun.get("dm-inbox").get(recipientKey).get(conversationId).put({
            conversationId,
            senderKey: myKeypair.pub,
            startedAt: now,
          });
          resolve(conversationId);
        }
      );
    });
  }

  /**
   * Send an encrypted DM.
   * @param recipientKey - The recipient's public key (for inbox notification)
   */
  async sendMessage(
    conversationId: string,
    content: string,
    recipientEpub: string,
    myKeypair: KeyPair,
    recipientKey: string
  ): Promise<TransportMessage> {
    const gun = GunInstanceManager.get();

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .put(message as any, (ack: any) => {
          if (ack.err) {
            reject(new Error(`Failed to send DM: ${ack.err}`));
            return;
          }

          // Update last message timestamp
          gun.get("dms").get(conversationId).get("meta").put({
            lastMessageAt: timestamp,
          });

          // Also notify recipient via inbox (so they know about this conversation)
          if (recipientKey) {
            gun.get("dm-inbox").get(recipientKey).get(conversationId).put({
              conversationId,
              senderKey: myKeypair.pub,
              startedAt: timestamp,
              lastMessageAt: timestamp,
            });
          }

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
   * Decrypts each message as it arrives with throttling to prevent
   * the "syncing 1K+ records" warning.
   */
  subscribe(
    conversationId: string,
    recipientEpub: string,
    myKeypair: KeyPair,
    handler: MessageHandler
  ): Unsubscribe {
    const gun = GunInstanceManager.get();
    const seenIds = new Set<string>();
    
    // Throttle: collect messages and flush periodically
    let pendingMessages: TransportMessage[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    
    const flush = () => {
      flushTimer = null;
      const toProcess = pendingMessages;
      pendingMessages = [];
      for (const msg of toProcess) {
        handler(msg);
      }
    };

    const ref = gun
      .get("dms")
      .get(conversationId)
      .get("messages")
      .map()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on(async (data: any) => {
        if (!data || !data.id || seenIds.has(data.id)) return;
        if (typeof data !== "object" || !data.encrypted) return;

        seenIds.add(data.id);

        try {
          // Decrypt the message
          const decryptedContent = await this.crypto.decryptMessage(
            data.encrypted,
            recipientEpub,
            myKeypair
          );

          // Verify signature against the claimed author's public key
          const signedPayload = JSON.stringify({
            id: data.id,
            encrypted: data.encrypted,
            timestamp: data.timestamp,
            authorKey: data.authorKey,
          });
          const verified = await SEA.verify(data.signature, data.authorKey);
          if (!verified || verified !== signedPayload) {
            console.warn("[DMManager] Message signature verification failed, dropping:", data.id);
            seenIds.delete(data.id);
            return;
          }

          const message: TransportMessage = {
            id: data.id,
            content: decryptedContent,
            timestamp: data.timestamp || Date.now(),
            authorKey: data.authorKey || "",
            channelId: conversationId,
            type: data.type || "text",
            signature: data.signature,
          };

          // Queue message and schedule flush
          pendingMessages.push(message);
          if (flushTimer === null) {
            flushTimer = setTimeout(flush, 16); // ~60fps
          }
        } catch (err) {
          console.error("Failed to decrypt DM:", err);
          // Skip messages we can't decrypt (shouldn't happen in normal flow)
        }
      });

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      ref.off();
    };
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
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      const messages: TransportMessage[] = [];
      let resolved = false;
      let pendingDecrypts = 0;
      let scanDone = false;

      const tryResolve = () => {
        if (scanDone && pendingDecrypts === 0 && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(messages.sort((a, b) => a.timestamp - b.timestamp).slice(-limit));
        }
      };

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once(async (data: any) => {
          if (!data || !data.id || typeof data !== "object" || !data.encrypted) return;

          pendingDecrypts++;
          try {
            const decryptedContent = await this.crypto.decryptMessage(
              data.encrypted,
              recipientEpub,
              myKeypair
            );

            // Verify signature against the claimed author's public key
            const signedPayload = JSON.stringify({
              id: data.id,
              encrypted: data.encrypted,
              timestamp: data.timestamp,
              authorKey: data.authorKey,
            });
            const verified = await SEA.verify(data.signature, data.authorKey);
            if (!verified || verified !== signedPayload) {
              console.warn("[DMManager] Message signature verification failed, dropping:", data.id);
              return;
            }

            messages.push({
              id: data.id,
              content: decryptedContent,
              timestamp: data.timestamp || 0,
              authorKey: data.authorKey || "",
              channelId: conversationId,
              type: data.type || "text",
              signature: data.signature,
            });
          } catch {
            // Skip undecryptable messages
          } finally {
            pendingDecrypts--;
            tryResolve();
          }
        });

      // Mark scan window closed after reasonable Gun sync wait
      setTimeout(() => {
        scanDone = true;
        tryResolve();
      }, 2000);
    });
  }

  /**
   * Get the user's DM conversation list.
   * Checks both the user's own DM list and their public inbox for incoming DMs.
   */
  async getConversations(): Promise<DMConversation[]> {
    const user = GunInstanceManager.user();
    const gun = GunInstanceManager.get();
    const myPublicKey = user.is?.pub;

    return new Promise((resolve) => {
      const conversationsMap = new Map<string, DMConversation>();
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(Array.from(conversationsMap.values()));
        }
      }, 3000);

      // 1. Load from user's own DM list
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user.get("dms").map().once((data: any) => {
        if (!data || !data.conversationId) return;

        conversationsMap.set(data.conversationId, {
          id: data.conversationId,
          recipientKey: data.recipientKey || "",
          startedAt: data.startedAt || 0,
          lastMessageAt: data.lastMessageAt || data.startedAt || 0,
          lastMessagePreview: "",
          unreadCount: 0,
          lastReadAt: data.lastReadAt || 0,
        });
      });

      // 2. Also check public inbox for incoming DMs from others
      if (myPublicKey) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        gun.get("dm-inbox").get(myPublicKey).map().once(async (data: any) => {
          if (!data || !data.conversationId) return;

          // Only add if we don't already have it
          if (!conversationsMap.has(data.conversationId)) {
            const valid = await this.verifyInboxEntry(
              data.conversationId,
              data.senderKey,
              myPublicKey
            );
            if (!valid) return;

            conversationsMap.set(data.conversationId, {
              id: data.conversationId,
              recipientKey: data.senderKey || "",
              startedAt: data.startedAt || 0,
              lastMessageAt: data.startedAt || 0,
              lastMessagePreview: "",
              unreadCount: 0,
              lastReadAt: 0, // Not read yet
            });

            this.persistInboxConversation(data.conversationId, data.senderKey, data.startedAt);
          }
        });
      }

      setTimeout(() => {
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          resolve(Array.from(conversationsMap.values()));
        }
      }, 1500);
    });
  }

  /**
   * Subscribe to changes in the DM conversation list.
   * Listens to both user's own DM list and public inbox for incoming DMs.
   */
  subscribeConversations(
    handler: (conversation: DMConversation) => void,
    myPublicKey?: string
  ): Unsubscribe {
    const user = GunInstanceManager.user();
    const gun = GunInstanceManager.get();
    const pubKey = myPublicKey || user.is?.pub;
    const seenConversations = new Set<string>();
    
    // Throttle: collect conversations and flush periodically
    let pendingConversations: DMConversation[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    
    const flush = () => {
      flushTimer = null;
      const toProcess = pendingConversations;
      pendingConversations = [];
      for (const conv of toProcess) {
        // Dedupe
        if (seenConversations.has(conv.id)) continue;
        seenConversations.add(conv.id);
        handler(conv);
      }
    };

    // 1. Listen to user's own DM list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ref1 = user.get("dms").map().on((data: any) => {
      if (!data || !data.conversationId) return;

      const conversation: DMConversation = {
        id: data.conversationId,
        recipientKey: data.recipientKey || "",
        startedAt: data.startedAt || 0,
        lastMessageAt: data.lastMessageAt || 0,
        lastMessagePreview: "",
        unreadCount: 0,
        lastReadAt: data.lastReadAt || 0,
      };

      // Queue and schedule flush
      pendingConversations.push(conversation);
      if (flushTimer === null) {
        flushTimer = setTimeout(flush, 16);
      }
    });

    // 2. Also listen to public inbox for incoming DMs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let ref2: any = null;
    if (pubKey) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref2 = gun.get("dm-inbox").get(pubKey).map().on(async (data: any) => {
        if (!data || !data.conversationId) return;

        // Check if we already know about this conversation to avoid overwriting lastReadAt
        if (seenConversations.has(data.conversationId)) return;
        seenConversations.add(data.conversationId);

        const valid = await this.verifyInboxEntry(
          data.conversationId,
          data.senderKey,
          pubKey
        );
        if (!valid) return;

        const conversation: DMConversation = {
          id: data.conversationId,
          recipientKey: data.senderKey || "",
          startedAt: data.startedAt || 0,
          lastMessageAt: data.startedAt || 0,
          lastMessagePreview: "",
          unreadCount: 0,
          lastReadAt: 0,
        };

        this.persistInboxConversation(data.conversationId, data.senderKey, data.startedAt);

        // Queue and schedule flush
        pendingConversations.push(conversation);
        if (flushTimer === null) {
          flushTimer = setTimeout(flush, 16);
        }
      });
    } else {
      console.warn("[DMManager] No public key available for inbox subscription!");
    }

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      ref1.off();
      if (ref2) ref2.off();
    };
  }

  /**
   * Look up a user's epub (encryption public key) from their Gun profile.
   * Needed to derive the shared secret.
   */
  async getRecipientEpub(publicKey: string): Promise<string> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve, reject) => {
      let resolved = false;

      // Look up epub from user's profile where it's published
      gun
        .user(publicKey)
        .get("profile")
        .get("_epub")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once((epub: any) => {
          if (resolved) return;
          if (epub && typeof epub === "string") {
            resolved = true;
            clearTimeout(timer);
            resolve(epub);
          }
        });

      // Timeout
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error("Could not resolve recipient's encryption key. They may need to update their profile."));
        }
      }, 5000);
    });
  }

  /**
   * Mark a conversation as read (update lastReadAt).
   */
  async markAsRead(conversationId: string): Promise<void> {
    const user = GunInstanceManager.user();
    const now = Date.now();
    
    return new Promise((resolve, reject) => {
      user.get("dms").get(conversationId).put(
        { lastReadAt: now },
        (ack: { err?: string }) => {
          if (ack.err) {
            reject(new Error(`Failed to mark conversation as read: ${ack.err}`));
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Verify that a dm-inbox entry corresponds to a real conversation in the shared graph,
   * and that the current user is a participant and the sender is the other participant.
   */
  private async verifyInboxEntry(
    conversationId: string,
    senderKey: string,
    myPublicKey: string
  ): Promise<boolean> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, 3000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gun.get("dms").get(conversationId).get("meta").once((meta: any) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          if (!meta || !meta.participantA || !meta.participantB) {
            resolve(false);
            return;
          }
          const participants = [meta.participantA, meta.participantB];
          const isParticipant = participants.includes(myPublicKey);
          const senderIsOtherParticipant = participants.includes(senderKey);
          resolve(isParticipant && senderIsOtherParticipant);
        }
      });
    });
  }

  /**
   * Persist an inbox-discovered conversation to the user's own DM list if not already present.
   */
  private persistInboxConversation(
    conversationId: string,
    senderKey: string,
    startedAt: number
  ): void {
    const user = GunInstanceManager.user();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user.get("dms").get(conversationId).once((existing: any) => {
      if (!existing || !existing.conversationId) {
        user.get("dms").get(conversationId).put({
          conversationId,
          recipientKey: senderKey,
          startedAt: startedAt || Date.now(),
          lastReadAt: 0,
        });
      }
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
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const random = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  return `dm-${Date.now().toString(36)}-${random}`;
}
