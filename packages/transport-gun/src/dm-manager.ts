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

    // Store conversation metadata in shared graph
    const participants = [myKeypair.pub, recipientKey].sort();
    gun.get("dms").get(conversationId).get("meta").put({
      participantA: participants[0],
      participantB: participants[1],
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
    const gun = GunInstanceManager.get();
    const seenIds = new Set<string>();

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

          const message: TransportMessage = {
            id: data.id,
            content: decryptedContent,
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
    const gun = GunInstanceManager.get();

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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once(async (data: any) => {
          if (!data || !data.id || typeof data !== "object" || !data.encrypted) return;

          try {
            const decryptedContent = await this.crypto.decryptMessage(
              data.encrypted,
              recipientEpub,
              myKeypair
            );

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
    const user = GunInstanceManager.user();

    return new Promise((resolve) => {
      const conversations: DMConversation[] = [];
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(conversations);
        }
      }, 3000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user.get("dms").map().once((data: any) => {
        if (!data || !data.conversationId) return;

        conversations.push({
          id: data.conversationId,
          recipientKey: data.recipientKey || "",
          startedAt: data.startedAt || 0,
          lastMessageAt: data.lastMessageAt || data.startedAt || 0,
          lastMessagePreview: "",
          unreadCount: 0,
          lastReadAt: data.lastReadAt || 0,
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
    const user = GunInstanceManager.user();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ref = user.get("dms").map().on((data: any) => {
      if (!data || !data.conversationId) return;

      handler({
        id: data.conversationId,
        recipientKey: data.recipientKey || "",
        startedAt: data.startedAt || 0,
        lastMessageAt: data.lastMessageAt || 0,
        lastMessagePreview: "",
        unreadCount: 0,
        lastReadAt: data.lastReadAt || 0,
      });
    });

    return () => ref.off();
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
            resolve(epub);
          }
        });

      // Timeout
      setTimeout(() => {
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
