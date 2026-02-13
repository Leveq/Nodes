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

    // Add sender to our friends list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user.get("social") as any).get("friends").get(request.fromKey).put({
      publicKey: request.fromKey,
      addedAt: now,
    });

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

    // Update shared request status
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gun.get("requests") as any).get(requestId).put({
      status: "declined",
      respondedAt: now,
    });

    // Remove from our incoming requests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user.get("social") as any).get("incomingRequests").get(requestId).put(null);
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
   * Removes from our graph. The other user's client should detect this
   * and clean up their side (or we accept asymmetric unfriending).
   */
  async removeFriend(publicKey: string): Promise<void> {
    const user = GunInstanceManager.user();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user.get("social") as any).get("friends").get(publicKey).put(null);
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
    _myKey: string,
    onAccepted: (request: FriendRequest) => void,
    onDeclined: (request: FriendRequest) => void
  ): Unsubscribe {
    const user = GunInstanceManager.user();
    const subscriptions: Unsubscribe[] = [];
    const seen = new Set<string>();
    
    // Throttle: collect request data and flush periodically
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let pendingRequests: any[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    
    const processRequest = (data: { requestId: string }) => {
      if (seen.has(data.requestId)) return;
      seen.add(data.requestId);

      // Subscribe to each request's status in the shared graph
      const sub = this.subscribeRequest(data.requestId, (request) => {
        if (request.status === "accepted") {
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

    // Mark as cancelled in shared graph (use declined status)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gun.get("requests") as any).get(requestId).put({
      status: "declined",
      respondedAt: Date.now(),
    });

    // Remove from our outgoing requests
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (user.get("social") as any).get("outgoingRequests").get(requestId).put(null);
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
