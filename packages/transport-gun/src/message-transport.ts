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
   */
  async send(
    channelId: string,
    message: string | Partial<Omit<TransportMessage, "id" | "timestamp" | "signature">>
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

    const id = generateMessageId();
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
      .get("channels")
      .get(channelId)
      .get("messages")
      .map()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on((data: any, _key: string) => {
        if (!data || !data.id || data.id === "_" || seenIds.has(data.id)) return;

        // Skip Gun metadata - but allow messages with attachments even if content is empty
        if (typeof data !== "object") return;
        if (!data.content && !data.attachments) return;

        console.log('[MessageTransport] Raw data from Gun:', JSON.stringify(data));

        seenIds.add(data.id);

        const message: TransportMessage & { attachments?: string } = {
          id: data.id,
          content: data.content || "",
          timestamp: data.timestamp || Date.now(),
          authorKey: data.authorKey || "",
          channelId: data.channelId || channelId,
          type: data.type || "text",
          signature: data.signature,
          editedAt: data.editedAt,
        };

        // Include attachments if present
        if (data.attachments) {
          console.log('[MessageTransport] Received message with attachments:', data.attachments);
          message.attachments = data.attachments;
        }

        // Queue message and schedule flush
        pendingMessages.push(message as TransportMessage);
        if (flushTimer === null) {
          flushTimer = setTimeout(flush, 16); // ~60fps
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
          };

          // Include attachments if present
          if (data.attachments) {
            msg.attachments = data.attachments;
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
   */
  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    const gun = GunInstanceManager.get();

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
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (ack: any) => {
                if (ack.err) reject(new Error(ack.err));
                else
                  resolve({
                    ...existing,
                    content: newContent,
                    signature,
                    editedAt,
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
