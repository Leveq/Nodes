import Gun from "gun";
import "gun/sea";
import { GunInstanceManager } from "./gun-instance";
import { DMCrypto } from "@nodes/crypto";
import type { KeyPair } from "@nodes/crypto";
import type { DMConversation } from "@nodes/core";
import type { TransportMessage, MessageHandler, Unsubscribe } from "@nodes/transport";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SEA = Gun.SEA as any;

/** Secondary timeout (ms) for _epubCert resolution — prevents stalling if the Gun node never fires. */
const EPUB_CERT_TIMEOUT_MS = 2000;

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
        // Add to seenIds IMMEDIATELY to prevent race condition with rapid Gun callbacks
        seenIds.add(data.id);
        
        if (typeof data !== "object" || !data.encrypted) {
          console.log("[DMManager] Skipping invalid message data:", data?.id || "no-id");
          return;
        }

        console.log("[DMManager] Processing message:", data.id, "from:", data.authorKey?.slice(0, 12));

        try {
          // Decrypt the message
          const decryptedContent = await this.crypto.decryptMessage(
            data.encrypted,
            recipientEpub,
            myKeypair
          );

          // Verify signature if present (legacy messages may not have signatures)
          // Only verify if signature is a valid non-empty string (Gun may return odd values for missing fields)
          if (data.signature && typeof data.signature === 'string' && data.signature.length > 10) {
            try {
              const signedPayload = JSON.stringify({
                id: data.id,
                encrypted: data.encrypted,
                timestamp: data.timestamp,
                authorKey: data.authorKey,
              });
              // SEA.verify returns the original DATA object if valid, undefined/false if invalid
              const verified = await SEA.verify(data.signature, data.authorKey);
              // Compare by stringifying since verify returns an object
              const verifiedStr = verified ? JSON.stringify(verified) : null;
              if (!verified || verifiedStr !== signedPayload) {
                console.warn("[DMManager] Message signature verification failed, dropping:", data.id);
                return;
              }
            } catch (sigErr) {
              console.warn("[DMManager] Signature verification error, allowing message:", data.id, sigErr);
            }
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
          console.error("[DMManager] Failed to decrypt DM:", data.id, err);
          console.error("[DMManager] recipientEpub:", recipientEpub?.slice(0, 20), "myPub:", myKeypair.pub?.slice(0, 12));
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

            // Verify signature if present (legacy messages may not have signatures)
            // Only verify if signature is a valid non-empty string (Gun may return odd values for missing fields)
            if (data.signature && typeof data.signature === 'string' && data.signature.length > 10) {
              try {
                const signedPayload = JSON.stringify({
                  id: data.id,
                  encrypted: data.encrypted,
                  timestamp: data.timestamp,
                  authorKey: data.authorKey,
                });
                // SEA.verify returns the original DATA object if valid, undefined/false if invalid
                const verified = await SEA.verify(data.signature, data.authorKey);
                const verifiedStr = verified ? JSON.stringify(verified) : null;
                if (!verified || verifiedStr !== signedPayload) {
                  console.warn("[DMManager] Message signature verification failed in getHistory, dropping:", data.id);
                  return;
                }
              } catch (sigErr) {
                console.warn("[DMManager] Signature verification error, allowing message:", data.id, sigErr);
              }
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
    console.log("[DMManager] getConversations called, myPub:", myPublicKey?.slice(0, 12));

    return new Promise((resolve) => {
      const conversationsMap = new Map<string, DMConversation>();
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.log("[DMManager] getConversations resolved (timeout), count:", conversationsMap.size);
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
   * Also fetches and verifies the epubCert (ECDSA binding of epub to pub key).
   * If the cert is present and invalid, throws to indicate active tampering.
   * If the cert is absent, proceeds with a warning (legacy identity).
   */
  async getRecipientEpub(publicKey: string): Promise<string> {
    const gun = GunInstanceManager.get();
    const noEpubCertWarning = `[DMManager] No epubCert for peer ${publicKey}, skipping MITM check (legacy identity)`;

    return new Promise((resolve, reject) => {
      let resolved = false;
      let epub: string | null = null;
      let epubCert: string | null = null;
      let epubReceived = false;
      let certReceived = false;
      let timer: ReturnType<typeof setTimeout>;
      let certTimer: ReturnType<typeof setTimeout>;

      const settle = (fn: () => void) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        clearTimeout(certTimer);
        fn();
      };

      const tryResolve = async () => {
        if (!epubReceived || !certReceived || resolved) return;

        if (!epub) {
          settle(() => reject(new Error("Could not resolve recipient's encryption key. They may need to update their profile.")));
          return;
        }

        if (epubCert) {
          // Verify the cert: it should be signed by the peer's pub key
          const verified = await SEA.verify(epubCert, publicKey);
          if (
            !verified ||
            typeof verified !== "object" ||
            (verified as { epub?: string }).epub !== epub
          ) {
            settle(() => reject(new Error(`[DMManager] epubCert verification failed for peer ${publicKey} — possible MITM attack`)));
            return;
          }
        } else {
          console.warn(noEpubCertWarning);
        }

        settle(() => resolve(epub!));
      };

      gun
        .user(publicKey)
        .get("profile")
        .get("_epub")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once((value: any) => {
          epub = value && typeof value === "string" ? value : null;
          epubReceived = true;
          tryResolve();
        });

      gun
        .user(publicKey)
        .get("profile")
        .get("_epubCert")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once((value: any) => {
          epubCert = value && typeof value === "string" ? value : null;
          certReceived = true;
          tryResolve();
        });

      // NOTE: Gun's .once() may never fire on a non-existent node in relay/P2P environments.
      // A secondary timeout ensures epub resolution is not blocked indefinitely for legacy
      // users who have not yet published _epubCert. See PR #45 oversight.
      certTimer = setTimeout(() => {
        if (!certReceived) {
          certReceived = true;
          tryResolve();
        }
      }, EPUB_CERT_TIMEOUT_MS);

      // Timeout
      timer = setTimeout(() => {
        if (!resolved) {
          if (epub) {
            if (!epubCert) console.warn(noEpubCertWarning);
            settle(() => resolve(epub!));
          } else {
            settle(() => reject(new Error("Could not resolve recipient's encryption key. They may need to update their profile.")));
          }
        }
      }, 5000);
    });
  }

  /**
   * Publish the epub and epubCert to the authenticated user's Gun profile.
   * Call this after login/identity creation to enable MITM protection for peers.
   */
  async publishEpubCert(epub: string, epubCert: string): Promise<void> {
    const user = GunInstanceManager.user();

    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      user.get("profile").get("_epub").put(epub, (ack: any) => {
        if (ack.err) {
          reject(new Error(`Failed to publish epub: ${ack.err}`));
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        user.get("profile").get("_epubCert").put(epubCert, (ack2: any) => {
          if (ack2.err) {
            reject(new Error(`Failed to publish epubCert: ${ack2.err}`));
          } else {
            resolve();
          }
        });
      });
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
