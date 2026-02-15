import Gun from "gun";
import "gun/sea";
import type {
  IMessageTransport,
  TransportMessage,
  MessageHandler,
  Unsubscribe,
  HistoryOpts,
} from "@nodes/transport";
import { GunInstanceManager } from "./gun-instance";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SEA = Gun.SEA as any;

/**
 * GunMessageTransport implements IMessageTransport using GunJS.
 *
 * Messages are stored in a shared graph under:
 *   gun.get("channels").get(channelId).get("messages")
 *
 * Each message is a node with a soul, signed by the author's keypair.
 * The graph structure enables real-time subscription via Gun's .map().on()
 */
export class GunMessageTransport implements IMessageTransport {
  /**
   * Send a message to a channel.
   * The message is signed with the sender's keypair for authenticity verification.
   *
   * @param channelId - The channel to send to
   * @param message - Either a string (content) or a partial message object
   * @param providedId - Optional pre-generated ID (for optimistic updates)
   */
  async send(
    channelId: string,
    message: string | Partial<Omit<TransportMessage, "id" | "timestamp" | "signature">>,
    providedId?: string
  ): Promise<TransportMessage> {
    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pair = (user as any)._.sea;

    if (!pair) {
      throw new Error("Not authenticated. Cannot send messages.");
    }

    // Normalize message input - allow passing just a string
    const msgObj = typeof message === "string"
      ? { content: message, type: "text" as const }
      : message;

    // Auto-fill authorKey from authenticated user
    const authorKey = msgObj.authorKey || pair.pub;
    const content = msgObj.content || "";
    const type = msgObj.type || "text";
    const attachments = (msgObj as any).attachments; // Optional attachments JSON string
    const replyTo = msgObj.replyTo; // Optional reply reference

    const id = providedId || generateMessageId();
    const timestamp = Date.now();

    // Sign the message content for verification
    const dataToSign = JSON.stringify({
      id,
      content,
      timestamp,
      authorKey,
      channelId,
    });
    const signature = await SEA.sign(dataToSign, pair);

    const fullMessage: TransportMessage & { attachments?: string } = {
      id,
      content,
      timestamp,
      authorKey,
      channelId,
      type,
      signature,
    };

    // Add attachments if present
    if (attachments) {
      fullMessage.attachments = attachments;
    }

    // Add reply reference if present
    if (replyTo) {
      fullMessage.replyTo = replyTo;
    }

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
            ...(attachments ? { attachments } : {}),
            ...(replyTo ? { replyTo: JSON.stringify(replyTo) } : {}),
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
   * Uses Gun's .map().on() for reactive updates with throttling
   * to prevent the "syncing 1K+ records" warning.
   */
  subscribe(channelId: string, handler: MessageHandler): Unsubscribe {
    const gun = GunInstanceManager.get();
    // Map of messageId → stateHash to detect actual changes
    const seenIds = new Map<string, string>();
    
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
      .get("channels")
      .get(channelId)
      .get("messages")
      .map()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on((data: any, _key: string) => {
        if (!data || !data.id || data.id === "_") return;

        // Skip Gun metadata - but allow messages with attachments even if content is empty
        if (typeof data !== "object") return;
        if (!data.content && !data.attachments) return;

        // Create a hash of the message state to detect actual changes
        const stateHash = `${data.content}|${data.edited}|${data.editedAt}|${data.deleted}|${data.deletedAt}`;
        const previousHash = seenIds.get(data.id);
        
        // Skip if we've seen this exact state before
        if (previousHash === stateHash) {
          return;
        }
        
        const isNew = previousHash === undefined;
        seenIds.set(data.id, stateHash);

        // Only log new messages or actual updates, not repeated Gun callbacks
        if (isNew) {
          console.log('[MessageTransport] New message from Gun:', data.id);
        } else {
          console.log('[MessageTransport] Message updated:', data.id, '(content/edited/deleted changed)');
        }

        const message: TransportMessage & { attachments?: string } = {
          id: data.id,
          content: data.content || "",
          timestamp: data.timestamp || Date.now(),
          authorKey: data.authorKey || "",
          channelId: data.channelId || channelId,
          type: data.type || "text",
          signature: data.signature,
          editedAt: data.editedAt,
          edited: data.edited,
          deleted: data.deleted,
          deletedAt: data.deletedAt,
          deletedBy: data.deletedBy,
        };

        // Include attachments if present
        if (data.attachments) {
          console.log('[MessageTransport] Received message with attachments:', data.attachments);
          message.attachments = data.attachments;
        }

        // Include reply reference if present
        if (data.replyTo) {
          try {
            message.replyTo = typeof data.replyTo === "string" 
              ? JSON.parse(data.replyTo) 
              : data.replyTo;
          } catch {
            console.warn('[MessageTransport] Failed to parse replyTo:', data.replyTo);
          }
        }

        // Include edit history if present
        if (data.editHistory) {
          try {
            message.editHistory = typeof data.editHistory === "string"
              ? JSON.parse(data.editHistory)
              : data.editHistory;
          } catch {
            console.warn('[MessageTransport] Failed to parse editHistory:', data.editHistory);
          }
        }

        // Queue message and schedule flush
        pendingMessages.push(message as TransportMessage);
        if (flushTimer === null) {
          flushTimer = setTimeout(flush, 0); // Immediate flush on next tick
        }
      });

    // Return unsubscribe function
    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      ref.off();
    };
  }

  /**
   * Get message history for a channel.
   * Gun doesn't have native pagination, so we load all and filter/sort client-side.
   */
  async getHistory(channelId: string, opts?: HistoryOpts): Promise<TransportMessage[]> {
    const gun = GunInstanceManager.get();
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once((data: any) => {
          if (!data || !data.id || typeof data !== "object") return;
          // Allow messages with attachments even if content is empty
          if (!data.content && !data.attachments) return;

          const msg: TransportMessage & { attachments?: string } = {
            id: data.id,
            content: data.content || "",
            timestamp: data.timestamp || 0,
            authorKey: data.authorKey || "",
            channelId: data.channelId || channelId,
            type: data.type || "text",
            signature: data.signature,
            editedAt: data.editedAt,
            edited: data.edited,
            deleted: data.deleted,
            deletedAt: data.deletedAt,
            deletedBy: data.deletedBy,
          };

          // Include attachments if present
          if (data.attachments) {
            msg.attachments = data.attachments;
          }

          // Include reply reference if present
          if (data.replyTo) {
            try {
              msg.replyTo = typeof data.replyTo === "string"
                ? JSON.parse(data.replyTo)
                : data.replyTo;
            } catch {
              // Ignore parse errors
            }
          }

          // Include edit history if present
          if (data.editHistory) {
            try {
              msg.editHistory = typeof data.editHistory === "string"
                ? JSON.parse(data.editHistory)
                : data.editHistory;
            } catch {
              // Ignore parse errors
            }
          }

          messages.push(msg as TransportMessage);

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
   * Verifies the current user is the author before deleting.
   */
  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pair = (user as any)._.sea;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const publicKey = (user as any).is?.pub;

    if (!pair || !publicKey) {
      throw new Error("Not authenticated. Cannot delete messages.");
    }

    return new Promise((resolve, reject) => {
      gun
        .get("channels")
        .get(channelId)
        .get("messages")
        .get(messageId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once(async (existing: any) => {
          if (!existing) {
            reject(new Error("Message not found"));
            return;
          }

          // Only the author can delete (Node owner check for moderation in future milestone)
          if (existing.authorKey !== publicKey) {
            reject(new Error("Cannot delete another user's message"));
            return;
          }

          const deletedAt = Date.now();

          // Re-sign the deleted message
          const dataToSign = JSON.stringify({
            id: messageId,
            content: "[deleted]",
            timestamp: existing.timestamp,
            authorKey: existing.authorKey,
            channelId,
          });
          const signature = await SEA.sign(dataToSign, pair);

          gun
            .get("channels")
            .get(channelId)
            .get("messages")
            .get(messageId)
            .put(
              {
                content: "[deleted]",
                deleted: true,
                deletedAt,
                deletedBy: publicKey,
                signature,
                // Clear sensitive data
                attachments: null,
                editHistory: null,
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (ack: any) => {
                if (ack.err) reject(new Error(ack.err));
                else resolve();
              }
            );
        });
    });
  }

  /**
   * Edit a message.
   * Adds the previous content to editHistory and sets edited flag.
   */
  async editMessage(
    channelId: string,
    messageId: string,
    newContent: string
  ): Promise<TransportMessage> {
    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pair = (user as any)._.sea;

    const editedAt = Date.now();

    return new Promise((resolve, reject) => {
      gun
        .get("channels")
        .get(channelId)
        .get("messages")
        .get(messageId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

          // Build edit history - parse existing if present
          let editHistory: Array<{ content: string; editedAt: number }> = [];
          if (existing.editHistory) {
            try {
              editHistory = typeof existing.editHistory === "string"
                ? JSON.parse(existing.editHistory)
                : existing.editHistory;
            } catch {
              editHistory = [];
            }
          }
          
          // Add current content to history before overwriting
          editHistory.push({
            content: existing.content,
            editedAt: editedAt,
          });

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
                edited: true,
                editedAt,
                editHistory: JSON.stringify(editHistory),
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (ack: any) => {
                if (ack.err) reject(new Error(ack.err));
                else
                  resolve({
                    ...existing,
                    content: newContent,
                    signature,
                    edited: true,
                    editedAt,
                    editHistory,
                  });
              }
            );
        });
    });
  }

  // ── Reaction Methods (Milestone 2.2) ──

  /**
   * Add a reaction to a message.
   * Reactions are stored at: channels/{channelId}/reactions/{messageId}/{emoji}/{publicKey}
   */
  async addReaction(
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const publicKey = (user as any).is?.pub;

    if (!publicKey) {
      throw new Error("Not authenticated. Cannot add reaction.");
    }

    gun
      .get("channels")
      .get(channelId)
      .get("reactions")
      .get(messageId)
      .get(emoji)
      .get(publicKey)
      .put({ timestamp: Date.now() });
  }

  /**
   * Remove a reaction from a message.
   * Sets the reaction to null (Gun "deletion").
   */
  async removeReaction(
    channelId: string,
    messageId: string,
    emoji: string
  ): Promise<void> {
    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const publicKey = (user as any).is?.pub;

    if (!publicKey) {
      throw new Error("Not authenticated. Cannot remove reaction.");
    }

    gun
      .get("channels")
      .get(channelId)
      .get("reactions")
      .get(messageId)
      .get(emoji)
      .get(publicKey)
      .put(null);
  }

  /**
   * Subscribe to reaction changes for all messages in a channel.
   * Handler is called with (messageId, reactions) whenever reactions change.
   */
  subscribeReactions(
    channelId: string,
    handler: (messageId: string, reactions: Record<string, Array<{ emoji: string; userKey: string; timestamp: number }>>) => void
  ): Unsubscribe {
    const gun = GunInstanceManager.get();
    const reactionsRef = gun.get("channels").get(channelId).get("reactions");

    // Track active subscription
    let isActive = true;
    
    // Live reaction data - messageId -> emoji -> userKey -> timestamp
    const liveReactions = new Map<string, Map<string, Map<string, number>>>();
    
    // Track subscribed paths to avoid duplicates
    const subscribedMessages = new Set<string>();
    const subscribedEmojis = new Set<string>();
    
    // Debounce emitting updates per message
    const pendingEmits = new Map<string, ReturnType<typeof setTimeout>>();
    
    // Emit current state for a message
    const emitReactions = (messageId: string) => {
      if (!isActive) return;
      
      const existing = pendingEmits.get(messageId);
      if (existing) clearTimeout(existing);
      
      const timer = setTimeout(() => {
        pendingEmits.delete(messageId);
        if (!isActive) return;
        
        const emojiMap = liveReactions.get(messageId);
        if (!emojiMap) return;
        
        const reactions: Record<string, Array<{ emoji: string; userKey: string; timestamp: number }>> = {};
        
        for (const [emoji, userMap] of emojiMap) {
          const users: Array<{ emoji: string; userKey: string; timestamp: number }> = [];
          for (const [userKey, timestamp] of userMap) {
            if (timestamp) {
              users.push({ emoji, userKey, timestamp });
            }
          }
          if (users.length > 0) {
            reactions[emoji] = users;
          }
        }
        
        if (Object.keys(reactions).length > 0) {
          handler(messageId, reactions);
        }
      }, 150);
      
      pendingEmits.set(messageId, timer);
    };
    
    // Subscribe to user-level changes for a specific message+emoji
    const subscribeToUsers = (messageId: string, emoji: string) => {
      const key = `${messageId}/${emoji}`;
      if (subscribedEmojis.has(key)) return;
      subscribedEmojis.add(key);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reactionsRef.get(messageId).get(emoji).map().on((data: any, userKey: string) => {
        if (!isActive || !userKey || userKey === '_' || userKey === '#') return;
        
        if (!liveReactions.has(messageId)) {
          liveReactions.set(messageId, new Map());
        }
        const emojiMap = liveReactions.get(messageId)!;
        if (!emojiMap.has(emoji)) {
          emojiMap.set(emoji, new Map());
        }
        const userMap = emojiMap.get(emoji)!;
        
        if (data && typeof data === 'object' && data.timestamp) {
          userMap.set(userKey, data.timestamp);
        } else if (data === null) {
          userMap.delete(userKey);
          if (userMap.size === 0) emojiMap.delete(emoji);
        }
        
        emitReactions(messageId);
      });
    };
    
    // Subscribe to emoji-level changes for a specific message
    const subscribeToEmojis = (messageId: string) => {
      if (subscribedMessages.has(messageId)) return;
      subscribedMessages.add(messageId);
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reactionsRef.get(messageId).map().on((_data: any, emoji: string) => {
        if (!isActive || !emoji || emoji === '_' || emoji === '#') return;
        subscribeToUsers(messageId, emoji);
      });
    };

    // Subscribe to message-level changes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reactionsRef.map().on((_data: any, messageId: string) => {
      if (!isActive || !messageId || messageId === '_' || messageId === '#') return;
      subscribeToEmojis(messageId);
    });

    return () => {
      isActive = false;
      for (const timer of pendingEmits.values()) {
        clearTimeout(timer);
      }
      pendingEmits.clear();
      liveReactions.clear();
      subscribedMessages.clear();
      subscribedEmojis.clear();
      // Note: Gun doesn't have a clean way to unsubscribe nested .map().on() chains
      // Setting isActive = false prevents handlers from processing
    };
  }
}

// ── Helpers ──

/** Generate a unique message ID (exported for optimistic updates) */
export function generateMessageId(): string {
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
