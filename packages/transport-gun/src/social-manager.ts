import { GunInstanceManager } from "./gun-instance";
import type { FriendRequest, Friend, BlockedUser } from "@nodes/core";
import type { Unsubscribe } from "@nodes/transport";

/**
 * SocialManager handles the friend system, requests, and blocks.
 *
 * The critical design challenge: User A cannot write to User B's
 * authenticated Gun graph. The solution is a shared "requests" graph
 * that both can read/write, combined with subscriptions that trigger
 * local graph updates when request status changes.
 */
export class SocialManager {
  // ── Friend Requests ──

  /**
   * Send a friend/message request.
   * Creates the request in the shared graph and records it in the sender's graph.
   */
  async sendRequest(
    fromKey: string,
    toKey: string,
    message: string = ""
  ): Promise<FriendRequest> {
    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();

    // Prevent self-friending
    if (fromKey === toKey) {
      throw new Error("You cannot send a friend request to yourself.");
    }

    // Check if blocked
    const isBlocked = await this.isBlocked(toKey);
    if (isBlocked) {
      throw new Error("Cannot send request to a blocked user.");
    }

    // Check for existing request
    const existingRequest = await this.getRequestBetween(fromKey, toKey);
    if (existingRequest) {
      if (existingRequest.status === "pending") {
        if (existingRequest.fromKey === fromKey) {
          throw new Error("You already sent a request to this user.");
        } else {
          // They sent US a request — auto-accept instead
          throw new Error("INCOMING_REQUEST_EXISTS");
          // The UI should catch this and offer to accept instead
        }
      }
    }

    // Check if already friends
    const isFriend = await this.isFriend(toKey);
    if (isFriend) {
      throw new Error("You are already friends with this user.");
    }

    const requestId = generateRequestId(fromKey, toKey);
    const now = Date.now();

    const request: FriendRequest = {
      id: requestId,
      fromKey,
      toKey,
      type: "friend",
      message,
      status: "pending",
      createdAt: now,
      respondedAt: null,
    };

    // Write to shared request graph
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (gun.get("requests") as any).get(requestId).put(
        {
          id: request.id,
          fromKey: request.fromKey,
          toKey: request.toKey,
          type: request.type,
          message: request.message,
          status: request.status,
          createdAt: request.createdAt,
          respondedAt: null,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ack: any) => {
          if (ack.err) {
            reject(new Error(`Failed to send request: ${ack.err}`));
            return;
          }

          // Record in sender's outgoing requests
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (user.get("social") as any).get("outgoingRequests").get(requestId).put({
            requestId,
            toKey,
            createdAt: now,
          });

          resolve(request);
        }
      );
    });
  }

  /**
   * Accept a friend request.
   * Updates shared graph, adds friend to own graph.
   * The sender's client will detect the acceptance via subscription
   * and add us to their friends list.
   */
  async acceptRequest(requestId: string): Promise<void> {
    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();
    const now = Date.now();

    // Get the request to find the sender
    const request = await this.getRequest(requestId);
    if (!request) throw new Error("Request not found.");
    if (request.status !== "pending") throw new Error("Request is no longer pending.");

    // Update shared request status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gun.get("requests") as any).get(requestId).put({
      status: "accepted",
      respondedAt: now,
    });

    // Notify the sender via their accepted-inbox (reliable real-time notification)
    const myPub = user?.is?.pub;
    if (myPub) {
      await this.writeAcceptedNotification(request.fromKey, myPub, requestId);
    }

    // Add sender to our friends list (guard against self-friending from corrupt data)
    if (request.fromKey === myPub) {
      console.warn("[SocialManager] Prevented adding self as friend in acceptRequest");
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (user.get("social") as any).get("friends").get(request.fromKey).put({
        publicKey: request.fromKey,
        addedAt: now,
      });
    }

    // Remove from our incoming requests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user.get("social") as any).get("incomingRequests").get(requestId).put(null);
  }

  /**
   * Decline a friend request.
   */
  async declineRequest(requestId: string): Promise<void> {
    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();
    const now = Date.now();
    const myPub = user?.is?.pub;

    // Get the request to find the sender
    const request = await this.getRequest(requestId);

    // Update shared request status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gun.get("requests") as any).get(requestId).put({
      status: "declined",
      respondedAt: now,
    });

    // Remove from our incoming requests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user.get("social") as any).get("incomingRequests").get(requestId).put(null);

    // Notify the sender that the request was declined
    if (request && myPub) {
      await this.writeDeclinedNotification(request.fromKey, requestId, myPub);
    }
  }

  /**
   * Write declined notification to sender's inbox.
   * When we decline a request, notify the sender so they can remove it from outgoing.
   */
  async writeDeclinedNotification(
    senderKey: string,
    requestId: string,
    fromKey: string
  ): Promise<void> {
    const gun = GunInstanceManager.get();
    console.log("[SocialManager] Writing declined notification:", { senderKey: senderKey.slice(0,8), requestId });

    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (gun.get("declined-inbox") as any).get(senderKey).get(requestId).put(
        {
          fromKey,
          requestId,
          declinedAt: Date.now(),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ack: any) => {
          if (ack.err) {
            console.error("[SocialManager] Failed to write declined notification:", ack.err);
          }
          resolve();
        }
      );
      // Timeout fallback
      setTimeout(resolve, 1000);
    });
  }

  /**
   * Subscribe to declined-inbox for real-time decline detection.
   * When someone declines our friend request, we get notified here.
   */
  subscribeDeclinedInbox(
    myKey: string,
    handler: (requestId: string) => void
  ): Unsubscribe {
    const gun = GunInstanceManager.get();
    const processedRequests = new Set<string>();
    const subscriptionStartTime = Date.now();
    
    console.log("[SocialManager] subscribeDeclinedInbox started for:", myKey.slice(0,8), "at:", subscriptionStartTime);

    const ref = gun
      .get("declined-inbox")
      .get(myKey)
      .map()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on((data: any, key: string) => {
        console.log("[SocialManager] Declined inbox received data:", { key, data, myKey: myKey.slice(0,8) });
        
        if (!data || !data.requestId || !data.declinedAt) {
          console.log("[SocialManager] Declined inbox - invalid data, skipping");
          return;
        }
        
        // Skip if already processed
        if (processedRequests.has(key)) {
          console.log("[SocialManager] Declined inbox - already processed:", key);
          return;
        }
        
        // Ignore old notifications (older than 60 seconds before subscription started)
        const cutoffTime = subscriptionStartTime - 60000;
        if (data.declinedAt < cutoffTime) {
          console.log("[SocialManager] Ignoring old declined notification, declinedAt:", data.declinedAt, "cutoff:", cutoffTime);
          return;
        }
        
        processedRequests.add(key);
        console.log("[SocialManager] Processing declined request:", data.requestId);
        handler(data.requestId);
      });

    return () => {
      ref.off();
    };
  }

  /**
   * Get a request by ID from the shared graph.
   */
  async getRequest(requestId: string): Promise<FriendRequest | null> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (gun.get("requests") as any).get(requestId).once((data: any) => {
        if (!data || !data.id) {
          resolve(null);
          return;
        }
        resolve({
          id: data.id,
          fromKey: data.fromKey || "",
          toKey: data.toKey || "",
          type: data.type || "friend",
          message: data.message || "",
          status: data.status || "pending",
          createdAt: data.createdAt || 0,
          respondedAt: data.respondedAt || null,
        });
      });

      // Timeout
      setTimeout(() => resolve(null), 3000);
    });
  }

  /**
   * Get the request between two specific users (if any).
   */
  async getRequestBetween(
    keyA: string,
    keyB: string
  ): Promise<FriendRequest | null> {
    const requestId = generateRequestId(keyA, keyB);
    return this.getRequest(requestId);
  }

  /**
   * Subscribe to changes on a specific request.
   * Used by the SENDER to detect when their request is accepted/declined.
   * Throttled to prevent rapid-fire callbacks.
   */
  subscribeRequest(
    requestId: string,
    handler: (request: FriendRequest) => void
  ): Unsubscribe {
    const gun = GunInstanceManager.get();
    
    // Throttle: collect request updates and flush periodically
    let pendingRequest: FriendRequest | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    
    const flush = () => {
      flushTimer = null;
      if (pendingRequest) {
        handler(pendingRequest);
        pendingRequest = null;
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ref = (gun.get("requests") as any).get(requestId).on((data: any) => {
      if (!data || !data.id) return;

      pendingRequest = {
        id: data.id,
        fromKey: data.fromKey || "",
        toKey: data.toKey || "",
        type: data.type || "friend",
        message: data.message || "",
        status: data.status || "pending",
        createdAt: data.createdAt || 0,
        respondedAt: data.respondedAt || null,
      };
      
      // Schedule flush
      if (flushTimer === null) {
        flushTimer = setTimeout(flush, 16);
      }
    });

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      ref.off();
    };
  }

  /**
   * Check for incoming requests from known users (Node members).
   * Since we can't subscribe to "all requests where toKey === myKey" in Gun
   * without a global scan, we use a polling approach.
   */
  async checkIncomingRequests(
    myKey: string,
    knownPublicKeys: string[]
  ): Promise<FriendRequest[]> {
    const requests: FriendRequest[] = [];

    for (const otherKey of knownPublicKeys) {
      const requestId = generateRequestId(myKey, otherKey);
      const request = await this.getRequest(requestId);

      if (request && request.status === "pending" && request.toKey === myKey) {
        requests.push(request);
      }
    }

    return requests;
  }

  /**
   * Write notification to recipient's inbox.
   * When someone sends us a request, they write the requestId to:
   *   gun.get("request-inbox").get(recipientKey).get(requestId)
   *
   * This is a PUBLIC path (not authenticated), so anyone can write to it.
   * We validate by checking the actual request in the shared graph.
   */
  async writeRequestNotification(
    recipientKey: string,
    requestId: string,
    fromKey: string
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gun.get("request-inbox") as any).get(recipientKey).get(requestId).put({
      requestId,
      fromKey,
      createdAt: Date.now(),
    });
  }

  /**
   * Subscribe to our request inbox for real-time incoming request detection.
   * Throttled to prevent rapid-fire callbacks.
   */
  subscribeInbox(
    myKey: string,
    handler: (requestId: string, fromKey: string) => void
  ): Unsubscribe {
    const gun = GunInstanceManager.get();
    
    // Throttle: collect inbox updates and flush periodically
    let pendingInbox: Array<{ requestId: string; fromKey: string }> = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    
    const flush = () => {
      flushTimer = null;
      const toProcess = pendingInbox;
      pendingInbox = [];
      for (const { requestId, fromKey } of toProcess) {
        handler(requestId, fromKey);
      }
    };

    const ref = gun
      .get("request-inbox")
      .get(myKey)
      .map()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on((data: any) => {
        if (!data || !data.requestId) return;
        
        // Queue and schedule flush
        pendingInbox.push({ requestId: data.requestId, fromKey: data.fromKey });
        if (flushTimer === null) {
          flushTimer = setTimeout(flush, 16);
        }
      });

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      ref.off();
    };
  }

  // ── Friends ──

  /**
   * Get the current user's friend list.
   */
  async getFriends(): Promise<Friend[]> {
    const user = GunInstanceManager.user();

    return new Promise((resolve) => {
      const friends: Friend[] = [];
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(friends);
        }
      }, 3000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (user.get("social") as any).get("friends").map().once((data: any) => {
        if (!data || !data.publicKey) return;
        friends.push({
          publicKey: data.publicKey,
          addedAt: data.addedAt || 0,
          nickname: data.nickname,
        });
      });

      setTimeout(() => {
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          resolve(friends);
        }
      }, 1500);
    });
  }

  /**
   * Check if a user is in our friend list.
   */
  async isFriend(publicKey: string): Promise<boolean> {
    const user = GunInstanceManager.user();

    return new Promise((resolve) => {
      let resolved = false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (user.get("social") as any).get("friends").get(publicKey).once((data: any) => {
        if (!resolved) {
          resolved = true;
          resolve(!!data && !!data.publicKey);
        }
      });

      // Timeout → not a friend
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, 2000);
    });
  }

  /**
   * Remove a friend (unfriend).
   * Removes from our graph and notifies the other user via unfriend-inbox.
   */
  async removeFriend(publicKey: string, myKey: string): Promise<void> {
    const user = GunInstanceManager.user();
    console.log("[SocialManager] removeFriend called:", { publicKey: publicKey.slice(0,8), myKey: myKey.slice(0,8) });
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user.get("social") as any).get("friends").get(publicKey).put(null);

    // Notify the other user that they've been unfriended
    await this.writeUnfriendNotification(publicKey, myKey);
    console.log("[SocialManager] Unfriend notification written");
  }

  /**
   * Remove a friend from our Gun graph only (no notification).
   * Used when processing an unfriend notification from the other user.
   */
  async removeFriendFromGraph(publicKey: string): Promise<void> {
    const user = GunInstanceManager.user();
    console.log("[SocialManager] removeFriendFromGraph called:", publicKey.slice(0, 8));
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user.get("social") as any).get("friends").get(publicKey).put(null);
  }

  /**
   * Write unfriend notification to recipient's inbox.
   * When we unfriend someone, write to:
   *   gun.get("unfriend-inbox").get(recipientKey).get(ourKey)
   */
  async writeUnfriendNotification(
    recipientKey: string,
    fromKey: string
  ): Promise<void> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (gun.get("unfriend-inbox") as any).get(recipientKey).get(fromKey).put(
        {
          fromKey,
          unfriendedAt: Date.now(),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ack: any) => {
          if (ack.err) {
            console.error("[SocialManager] Failed to write unfriend notification:", ack.err);
          }
          resolve();
        }
      );
      // Timeout fallback in case Gun doesn't acknowledge
      setTimeout(resolve, 1000);
    });
  }

  /**
   * Subscribe to unfriend-inbox for real-time unfriend detection.
   * Only processes notifications from the last 60 seconds to avoid
   * re-triggering old notifications on app restart.
   */
  subscribeUnfriendInbox(
    myKey: string,
    handler: (fromKey: string) => void
  ): Unsubscribe {
    const gun = GunInstanceManager.get();
    // Track the last processed timestamp for each key to handle repeated unfriend/refriend cycles
    const processedTimestamps = new Map<string, number>();
    const subscriptionStartTime = Date.now();
    
    console.log("[SocialManager] subscribeUnfriendInbox started for:", myKey.slice(0,8));

    const ref = gun
      .get("unfriend-inbox")
      .get(myKey)
      .map()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on((data: any, key: string) => {
        console.log("[SocialManager] Unfriend inbox data received:", { key: key?.slice(0,8), data });
        
        if (!data || !data.fromKey || !data.unfriendedAt) return;
        
        // Ignore old notifications (older than 60 seconds before subscription started)
        // This prevents re-triggering on app restart
        const cutoffTime = subscriptionStartTime - 60000;
        if (data.unfriendedAt < cutoffTime) {
          console.log("[SocialManager] Ignoring old unfriend notification");
          return;
        }
        
        // Check if this is a new unfriend event (newer timestamp than last processed)
        const lastProcessed = processedTimestamps.get(key) || 0;
        if (data.unfriendedAt <= lastProcessed) {
          console.log("[SocialManager] Already processed this unfriend timestamp");
          return;
        }
        
        // Mark this timestamp as processed
        processedTimestamps.set(key, data.unfriendedAt);
        console.log("[SocialManager] Processing unfriend from:", data.fromKey.slice(0,8));
        handler(data.fromKey);
      });

    return () => {
      ref.off();
    };
  }

  /**
   * Clear unfriend notification after processing.
   */
  async clearUnfriendNotification(myKey: string, fromKey: string): Promise<void> {
    const gun = GunInstanceManager.get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gun.get("unfriend-inbox") as any).get(myKey).get(fromKey).put(null);
  }

  // ── Accepted Inbox (for reliable friend request acceptance notification) ──

  /**
   * Write acceptance notification to sender's inbox.
   * When we accept someone's request, write to:
   *   gun.get("accepted-inbox").get(senderKey).get(requestId)
   */
  async writeAcceptedNotification(
    senderKey: string,
    acceptorKey: string,
    requestId: string
  ): Promise<void> {
    const gun = GunInstanceManager.get();
    console.log("[SocialManager] Writing accepted notification:", { senderKey: senderKey.slice(0,8), acceptorKey: acceptorKey.slice(0,8), requestId });

    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (gun.get("accepted-inbox") as any).get(senderKey).get(requestId).put(
        {
          acceptorKey,
          requestId,
          acceptedAt: Date.now(),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ack: any) => {
          if (ack.err) {
            console.error("[SocialManager] Failed to write accepted notification:", ack.err);
          }
          resolve();
        }
      );
      // Timeout fallback
      setTimeout(resolve, 1000);
    });
  }

  /**
   * Subscribe to accepted-inbox for real-time acceptance detection.
   * When someone accepts our friend request, we get notified here.
   */
  subscribeAcceptedInbox(
    myKey: string,
    handler: (acceptorKey: string, requestId: string) => void
  ): Unsubscribe {
    const gun = GunInstanceManager.get();
    const processedRequests = new Set<string>();
    const subscriptionStartTime = Date.now();
    
    console.log("[SocialManager] subscribeAcceptedInbox started for:", myKey.slice(0,8));

    const ref = gun
      .get("accepted-inbox")
      .get(myKey)
      .map()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on((data: any, key: string) => {
        if (!data || !data.acceptorKey || !data.requestId || !data.acceptedAt) return;
        
        // Skip if already processed
        if (processedRequests.has(key)) return;
        
        // Ignore old notifications (older than 60 seconds before subscription started)
        const cutoffTime = subscriptionStartTime - 60000;
        if (data.acceptedAt < cutoffTime) {
          console.log("[SocialManager] Ignoring old accepted notification");
          return;
        }
        
        processedRequests.add(key);
        console.log("[SocialManager] Processing accepted from:", data.acceptorKey.slice(0,8));
        handler(data.acceptorKey, data.requestId);
      });

    return () => {
      ref.off();
    };
  }

  /**
   * Subscribe to friend list changes.
   */
  subscribeFriends(handler: (friend: Friend | null, publicKey: string) => void): Unsubscribe {
    const user = GunInstanceManager.user();
    
    // Throttle: collect friend updates and flush periodically
    let pendingUpdates: Array<{ friend: Friend | null; key: string }> = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    
    const flush = () => {
      flushTimer = null;
      const toProcess = pendingUpdates;
      pendingUpdates = [];
      for (const { friend, key } of toProcess) {
        handler(friend, key);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ref = (user.get("social") as any).get("friends").map().on((data: any, key: string) => {
      let friend: Friend | null = null;
      
      if (!data) {
        // Deleted friend
      } else if (data.publicKey) {
        friend = {
          publicKey: data.publicKey,
          addedAt: data.addedAt || 0,
          nickname: data.nickname,
        };
      } else {
        return; // Invalid data, skip
      }

      // Queue and schedule flush
      pendingUpdates.push({ friend, key });
      if (flushTimer === null) {
        flushTimer = setTimeout(flush, 16);
      }
    });

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      ref.off();
    };
  }

  // ── Blocking ──

  /**
   * Block a user.
   * Blocked users cannot send requests or messages.
   * Also removes them as a friend if they are one.
   */
  async blockUser(publicKey: string): Promise<void> {
    const user = GunInstanceManager.user();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user.get("social") as any).get("blocked").get(publicKey).put({
      publicKey,
      blockedAt: Date.now(),
    });

    // Also remove as friend if they are one
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user.get("social") as any).get("friends").get(publicKey).put(null);
  }

  /**
   * Unblock a user.
   */
  async unblockUser(publicKey: string): Promise<void> {
    const user = GunInstanceManager.user();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user.get("social") as any).get("blocked").get(publicKey).put(null);
  }

  /**
   * Check if a user is blocked.
   */
  async isBlocked(publicKey: string): Promise<boolean> {
    const user = GunInstanceManager.user();

    return new Promise((resolve) => {
      let resolved = false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (user.get("social") as any).get("blocked").get(publicKey).once((data: any) => {
        if (!resolved) {
          resolved = true;
          resolve(!!data && !!data.publicKey);
        }
      });

      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
      }, 2000);
    });
  }

  /**
   * Get blocked user list.
   */
  async getBlockedUsers(): Promise<BlockedUser[]> {
    const user = GunInstanceManager.user();

    return new Promise((resolve) => {
      const blocked: BlockedUser[] = [];
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(blocked);
        }
      }, 3000);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (user.get("social") as any).get("blocked").map().once((data: any) => {
        if (!data || !data.publicKey) return;
        blocked.push({ publicKey: data.publicKey, blockedAt: data.blockedAt || 0 });
      });

      setTimeout(() => {
        if (!resolved) {
          clearTimeout(timeout);
          resolved = true;
          resolve(blocked);
        }
      }, 1500);
    });
  }

  // ── Outgoing Request Subscription ──

  /**
   * Subscribe to status changes on all outgoing requests.
   * When a request is accepted, the sender's client:
   * 1. Detects the status change
   * 2. Adds the recipient to the sender's friends list
   * 3. Creates the DM conversation in the sender's graph
   */
  subscribeOutgoingRequests(
    myKey: string,
    onAccepted: (request: FriendRequest) => void,
    onDeclined: (request: FriendRequest) => void
  ): Unsubscribe {
    const user = GunInstanceManager.user();
    const subscriptions: Unsubscribe[] = [];
    const seen = new Set<string>();
    // Track which request status changes we've already processed
    const processedStatuses = new Map<string, string>();
    
    // Throttle: collect request data and flush periodically
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pendingRequests: any[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    
    const processRequest = (data: { requestId: string }) => {
      if (seen.has(data.requestId)) return;
      seen.add(data.requestId);

      // Subscribe to each request's status in the shared graph
      const sub = this.subscribeRequest(data.requestId, (request) => {
        // Check if we've already processed this status for this request
        const lastProcessedStatus = processedStatuses.get(request.id);
        if (lastProcessedStatus === request.status) {
          return; // Already processed this status change
        }
        
        if (request.status === "accepted") {
          processedStatuses.set(request.id, "accepted");
          
          // Don't add yourself as a friend
          if (request.toKey === myKey) {
            console.warn("[SocialManager] Prevented adding self as friend");
            return;
          }
          
          // Add them to our friends list
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (user.get("social") as any).get("friends").get(request.toKey).put({
            publicKey: request.toKey,
            addedAt: Date.now(),
          });

          // Clean up outgoing request
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (user.get("social") as any).get("outgoingRequests").get(request.id).put(null);

          onAccepted(request);
        } else if (request.status === "declined") {
          processedStatuses.set(request.id, "declined");
          
          // Clean up outgoing request
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (user.get("social") as any).get("outgoingRequests").get(request.id).put(null);

          onDeclined(request);
        }
      });

      subscriptions.push(sub);
    };
    
    const flush = () => {
      flushTimer = null;
      const toProcess = pendingRequests;
      pendingRequests = [];
      
      for (const data of toProcess) {
        processRequest(data);
      }
    };

    // Watch our outgoing requests list for request IDs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ref = (user.get("social") as any).get("outgoingRequests").map().on((data: any) => {
      if (!data || !data.requestId) return;
      
      // Queue and schedule flush
      pendingRequests.push(data);
      if (flushTimer === null) {
        flushTimer = setTimeout(flush, 16);
      }
    });

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      ref.off();
      subscriptions.forEach((s) => s());
    };
  }

  /**
   * Cancel an outgoing request.
   */
  async cancelRequest(requestId: string): Promise<void> {
    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();
    const myPub = user?.is?.pub;

    // Get the request to find the recipient
    const request = await this.getRequest(requestId);

    // Mark as cancelled in shared graph (use declined status)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gun.get("requests") as any).get(requestId).put({
      status: "declined",
      respondedAt: Date.now(),
    });

    // Remove from our outgoing requests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user.get("social") as any).get("outgoingRequests").get(requestId).put(null);

    // Notify the recipient that the request was cancelled
    if (request && myPub) {
      await this.writeCancelledNotification(request.toKey, requestId, myPub);
    }
  }

  /**
   * Write cancelled notification to recipient's inbox.
   * When we cancel a request, notify the recipient so they can remove it from incoming.
   */
  async writeCancelledNotification(
    recipientKey: string,
    requestId: string,
    fromKey: string
  ): Promise<void> {
    const gun = GunInstanceManager.get();
    console.log("[SocialManager] Writing cancelled notification:", { recipientKey: recipientKey.slice(0,8), requestId });

    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (gun.get("cancelled-inbox") as any).get(recipientKey).get(requestId).put(
        {
          fromKey,
          requestId,
          cancelledAt: Date.now(),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (ack: any) => {
          if (ack.err) {
            console.error("[SocialManager] Failed to write cancelled notification:", ack.err);
          }
          resolve();
        }
      );
      // Timeout fallback
      setTimeout(resolve, 1000);
    });
  }

  /**
   * Subscribe to cancelled-inbox for real-time cancellation detection.
   * When someone cancels a friend request they sent us, we get notified here.
   */
  subscribeCancelledInbox(
    myKey: string,
    handler: (requestId: string, fromKey: string) => void
  ): Unsubscribe {
    const gun = GunInstanceManager.get();
    const processedRequests = new Set<string>();
    const subscriptionStartTime = Date.now();
    
    console.log("[SocialManager] subscribeCancelledInbox started for:", myKey.slice(0,8), "at:", subscriptionStartTime);

    const ref = gun
      .get("cancelled-inbox")
      .get(myKey)
      .map()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on((data: any, key: string) => {
        console.log("[SocialManager] Cancelled inbox received data:", { key, data, myKey: myKey.slice(0,8) });
        
        if (!data || !data.requestId || !data.cancelledAt) {
          console.log("[SocialManager] Cancelled inbox - invalid data, skipping");
          return;
        }
        
        // Skip if already processed
        if (processedRequests.has(key)) {
          console.log("[SocialManager] Cancelled inbox - already processed:", key);
          return;
        }
        
        // Ignore old notifications (older than 60 seconds before subscription started)
        const cutoffTime = subscriptionStartTime - 60000;
        if (data.cancelledAt < cutoffTime) {
          console.log("[SocialManager] Ignoring old cancelled notification, cancelledAt:", data.cancelledAt, "cutoff:", cutoffTime);
          return;
        }
        
        processedRequests.add(key);
        console.log("[SocialManager] Processing cancelled request:", data.requestId, "from:", data.fromKey?.slice(0,8));
        handler(data.requestId, data.fromKey);
      });

    return () => {
      ref.off();
    };
  }

  /**
   * Get all outgoing requests.
   */
  async getOutgoingRequests(_myKey: string): Promise<FriendRequest[]> {
    const user = GunInstanceManager.user();

    return new Promise((resolve) => {
      const requestIds: string[] = [];
      let resolved = false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (user.get("social") as any).get("outgoingRequests").map().once((data: any) => {
        if (data && data.requestId) {
          requestIds.push(data.requestId);
        }
      });

      setTimeout(async () => {
        if (resolved) return;
        resolved = true;

        const requests: FriendRequest[] = [];
        for (const reqId of requestIds) {
          const req = await this.getRequest(reqId);
          if (req && req.status === "pending") {
            requests.push(req);
          }
        }
        resolve(requests);
      }, 1500);
    });
  }
}

// ── Helpers ──

function generateRequestId(keyA: string, keyB: string): string {
  const sorted = [keyA, keyB].sort();
  return `req-${hashString(sorted.join(":") + ":request")}`;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash).toString(36);
}

// Export for use by other modules that need to compute request IDs
export { generateRequestId };
