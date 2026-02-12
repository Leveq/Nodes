# MILESTONE 1.7 — FRIEND SYSTEM & DM REQUESTS
## Nodes: Decentralized Communication Platform

---

### ⚠️ IMPORTANT: REFACTOR NOTICE
### If you have implemented any workarounds for DM discovery (recipient not seeing DMs, polling hacks, writing to other users' graphs, etc.), REMOVE THEM before starting this milestone. This milestone provides the correct, spec-aligned solution. All DM initiation must go through the friend/request system built here. No user should receive messages from anyone who is not an accepted friend.

---

### OBJECTIVE
Implement a friend system with message requests that gates all DM communication. No user can receive unsolicited messages. Instead, a "message request" must be sent and accepted before a DM conversation can begin. This solves two problems simultaneously: (1) the DM discovery issue where recipients couldn't see incoming DMs, and (2) the permission model where users control who can message them.

The friend relationship is mutual, stored in both users' graphs, and unlocks DM communication in both directions. The request mechanism uses a shared Gun graph that both parties can read, avoiding the problem of one user needing to write to another's authenticated graph.

---

### DEFINITION OF DONE
- [ ] User can send a friend/message request to another user (from member list or by public key)
- [ ] Requests are stored in a shared Gun graph readable by both parties
- [ ] Recipient sees incoming requests in a notification area / requests panel
- [ ] Recipient can Accept or Decline a request
- [ ] Accepting creates a mutual friend relationship in BOTH users' graphs
- [ ] Accepting automatically creates the DM conversation in both users' graphs
- [ ] After acceptance, DMs work immediately in both directions (no discovery issue)
- [ ] Declining removes the request from the shared graph
- [ ] Friend list is viewable and manageable
- [ ] User can unfriend (removes mutual relationship, closes DM access)
- [ ] User can block another user (blocks all requests and messages from that user)
- [ ] DM initiation ("Send Message" on member list) now sends a request if not friends, or opens DM if already friends
- [ ] Incoming request notification badge on the DM icon in the sidebar
- [ ] Presence is shared between friends (friends can always see each other's online status)
- [ ] Presence in Nodes: members of the same Node can see each other's presence regardless of friend status
- [ ] Tests for request flow, acceptance, rejection, friend CRUD, and DM gating

---

### ARCHITECTURE

**The Request Graph (shared, readable by both parties):**
```
gun.get("requests").get(requestId) → {
  id: string,
  fromKey: string,       // Sender's public key
  toKey: string,         // Recipient's public key
  type: "friend",        // For future extensibility (could be "node-invite", etc.)
  message: string,       // Optional message ("Hey, want to connect?")
  status: "pending" | "accepted" | "declined",
  createdAt: number,
  respondedAt: number | null
}
```

**Request ID is deterministic** — derived from both public keys + "request" prefix:
```
requestId = hash(sort([fromKey, toKey]).join(":") + ":request")
```
This ensures only ONE active request can exist between two users at a time, and both users can compute the same ID to check for existing requests.

**User's Social Graph (in user's own authenticated graph):**
```
gun.user().get("social")
├── friends/
│   └── {publicKey} → { publicKey, addedAt, nickname? }
├── blocked/
│   └── {publicKey} → { publicKey, blockedAt }
├── outgoingRequests/
│   └── {requestId} → { requestId, toKey, createdAt }
└── incomingRequests/
│   └── {requestId} → { requestId, fromKey, createdAt }
```

**Why both a shared graph AND user graph references?**
- Shared graph: Both parties can read/write the request status without accessing each other's authenticated graphs
- User graph: Fast local lookup for "who are my friends?", "do I have pending requests?", "is this user blocked?" without scanning the entire shared request graph

**Friend Acceptance Flow:**
```
1. User A clicks "Send Message" on User B
2. System checks: Are they already friends?
   → YES: Open existing DM conversation
   → NO: Continue to step 3
3. System checks: Is there already a pending request?
   → YES (A→B): Show "Request already sent"
   → YES (B→A): Show "B sent you a request!" with Accept/Decline
   → NO: Continue to step 4
4. Create request in shared graph: gun.get("requests").get(requestId).put({...})
5. Add to A's outgoingRequests in A's user graph
6. Toast: "Message request sent to {B's name}"

--- On B's side ---

7. B detects new request (via subscription on shared graph or polling)
8. B sees request in their "Message Requests" panel
9. B clicks Accept:
   a. Update shared request: status → "accepted", respondedAt → now
   b. Add A to B's friends list: gun.user().get("social").get("friends").get(A.pub).put(...)
   c. Add B to... wait, B can't write to A's graph.

   SOLUTION: A is subscribed to the shared request graph. When status changes to
   "accepted", A's client detects it and adds B to A's friends list automatically.

   d. Both clients create the DM conversation in their respective user graphs
   e. DM conversation is now accessible from both sides

10. B clicks Decline:
    a. Update shared request: status → "declined", respondedAt → now
    b. Remove from B's incomingRequests
    c. A's subscription detects the decline, removes from A's outgoingRequests
    d. Toast on A's side: "Request to {B} was declined" (or silently remove)
```

**Presence Visibility Rules:**
```
Can User A see User B's presence?

1. Are they friends? → YES, always show presence
2. Are they in the same Node? → YES, show presence (community context)
3. Neither? → NO, User B is invisible to User A
```

---

### STEP-BY-STEP INSTRUCTIONS

#### 1. ADD SOCIAL TYPES TO CORE PACKAGE

**Update packages/core/src/index.ts** — add:

```typescript
// ── Social / Friend Types ──

export interface FriendRequest {
  id: string;
  fromKey: string;
  toKey: string;
  type: "friend";
  message: string;
  status: "pending" | "accepted" | "declined";
  createdAt: number;
  respondedAt: number | null;
}

export interface Friend {
  publicKey: string;
  displayName?: string;
  addedAt: number;
  nickname?: string;
}

export interface BlockedUser {
  publicKey: string;
  blockedAt: number;
}
```

#### 2. IMPLEMENT SOCIAL MANAGER (packages/transport-gun)

**packages/transport-gun/src/social-manager.ts:**
```typescript
import { GunInstance } from "./gun-instance";
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
    const gun = GunInstance.get();
    const user = GunInstance.user();

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
      gun.get("requests").get(requestId).put(
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
        (ack: any) => {
          if (ack.err) {
            reject(new Error(`Failed to send request: ${ack.err}`));
            return;
          }

          // Record in sender's outgoing requests
          user.get("social").get("outgoingRequests").get(requestId).put({
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
    const gun = GunInstance.get();
    const user = GunInstance.user();
    const now = Date.now();

    // Get the request to find the sender
    const request = await this.getRequest(requestId);
    if (!request) throw new Error("Request not found.");
    if (request.status !== "pending") throw new Error("Request is no longer pending.");

    // Update shared request status
    gun.get("requests").get(requestId).put({
      status: "accepted",
      respondedAt: now,
    });

    // Add sender to our friends list
    user.get("social").get("friends").get(request.fromKey).put({
      publicKey: request.fromKey,
      addedAt: now,
    });

    // Remove from our incoming requests
    user.get("social").get("incomingRequests").get(requestId).put(null);
  }

  /**
   * Decline a friend request.
   */
  async declineRequest(requestId: string): Promise<void> {
    const gun = GunInstance.get();
    const user = GunInstance.user();
    const now = Date.now();

    // Update shared request status
    gun.get("requests").get(requestId).put({
      status: "declined",
      respondedAt: now,
    });

    // Remove from our incoming requests
    user.get("social").get("incomingRequests").get(requestId).put(null);
  }

  /**
   * Get a request by ID from the shared graph.
   */
  async getRequest(requestId: string): Promise<FriendRequest | null> {
    const gun = GunInstance.get();

    return new Promise((resolve) => {
      gun.get("requests").get(requestId).once((data: any) => {
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
   */
  subscribeRequest(
    requestId: string,
    handler: (request: FriendRequest) => void
  ): Unsubscribe {
    const gun = GunInstance.get();

    const ref = gun.get("requests").get(requestId).on((data: any) => {
      if (!data || !data.id) return;

      handler({
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

    return () => ref.off();
  }

  /**
   * Poll for incoming requests.
   * Since we can't subscribe to "all requests where toKey === myKey" in Gun
   * without a global scan, we use a polling approach:
   *
   * For each member in our shared Nodes, compute the potential request ID
   * and check if a pending request exists.
   *
   * Alternative: When sending a request, ALSO write the requestId to a
   * shared discovery path that the recipient can subscribe to.
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
   * Subscribe to a discovery path for incoming requests.
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
    const gun = GunInstance.get();

    gun.get("request-inbox").get(recipientKey).get(requestId).put({
      requestId,
      fromKey,
      createdAt: Date.now(),
    });
  }

  /**
   * Subscribe to our request inbox for real-time incoming request detection.
   */
  subscribeInbox(
    myKey: string,
    handler: (requestId: string, fromKey: string) => void
  ): Unsubscribe {
    const gun = GunInstance.get();

    const ref = gun
      .get("request-inbox")
      .get(myKey)
      .map()
      .on((data: any) => {
        if (!data || !data.requestId) return;
        handler(data.requestId, data.fromKey);
      });

    return () => ref.off();
  }

  // ── Friends ──

  /**
   * Get the current user's friend list.
   */
  async getFriends(): Promise<Friend[]> {
    const user = GunInstance.user();

    return new Promise((resolve) => {
      const friends: Friend[] = [];
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(friends);
        }
      }, 3000);

      user.get("social").get("friends").map().once((data: any) => {
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
    const user = GunInstance.user();

    return new Promise((resolve) => {
      user.get("social").get("friends").get(publicKey).once((data: any) => {
        resolve(!!data && !!data.publicKey);
      });

      // Timeout → not a friend
      setTimeout(() => resolve(false), 2000);
    });
  }

  /**
   * Remove a friend (unfriend).
   * Removes from our graph. The other user's client should detect this
   * and clean up their side (or we accept asymmetric unfriending).
   */
  async removeFriend(publicKey: string): Promise<void> {
    const user = GunInstance.user();
    user.get("social").get("friends").get(publicKey).put(null);
  }

  /**
   * Subscribe to friend list changes.
   */
  subscribeFriends(handler: (friend: Friend) => void): Unsubscribe {
    const user = GunInstance.user();

    const ref = user.get("social").get("friends").map().on((data: any) => {
      if (!data || !data.publicKey) return;
      handler({
        publicKey: data.publicKey,
        addedAt: data.addedAt || 0,
        nickname: data.nickname,
      });
    });

    return () => ref.off();
  }

  // ── Blocking ──

  /**
   * Block a user.
   * Blocked users cannot send requests or messages.
   * Also removes them as a friend if they are one.
   */
  async blockUser(publicKey: string): Promise<void> {
    const user = GunInstance.user();

    user.get("social").get("blocked").get(publicKey).put({
      publicKey,
      blockedAt: Date.now(),
    });

    // Also remove as friend if they are one
    user.get("social").get("friends").get(publicKey).put(null);
  }

  /**
   * Unblock a user.
   */
  async unblockUser(publicKey: string): Promise<void> {
    const user = GunInstance.user();
    user.get("social").get("blocked").get(publicKey).put(null);
  }

  /**
   * Check if a user is blocked.
   */
  async isBlocked(publicKey: string): Promise<boolean> {
    const user = GunInstance.user();

    return new Promise((resolve) => {
      user.get("social").get("blocked").get(publicKey).once((data: any) => {
        resolve(!!data && !!data.publicKey);
      });

      setTimeout(() => resolve(false), 2000);
    });
  }

  /**
   * Get blocked user list.
   */
  async getBlockedUsers(): Promise<BlockedUser[]> {
    const user = GunInstance.user();

    return new Promise((resolve) => {
      const blocked: BlockedUser[] = [];
      let resolved = false;

      const timeout = setTimeout(() => {
        if (!resolved) { resolved = true; resolve(blocked); }
      }, 3000);

      user.get("social").get("blocked").map().once((data: any) => {
        if (!data || !data.publicKey) return;
        blocked.push({ publicKey: data.publicKey, blockedAt: data.blockedAt || 0 });
      });

      setTimeout(() => {
        if (!resolved) { clearTimeout(timeout); resolved = true; resolve(blocked); }
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
    const user = GunInstance.user();
    const gun = GunInstance.get();
    const subscriptions: Unsubscribe[] = [];

    // Watch our outgoing requests list for request IDs
    const ref = user.get("social").get("outgoingRequests").map().on((data: any) => {
      if (!data || !data.requestId) return;

      // Subscribe to each request's status in the shared graph
      const sub = this.subscribeRequest(data.requestId, (request) => {
        if (request.status === "accepted") {
          // Add them to our friends list
          user.get("social").get("friends").get(request.toKey).put({
            publicKey: request.toKey,
            addedAt: Date.now(),
          });

          // Clean up outgoing request
          user.get("social").get("outgoingRequests").get(request.id).put(null);

          onAccepted(request);
        } else if (request.status === "declined") {
          // Clean up outgoing request
          user.get("social").get("outgoingRequests").get(request.id).put(null);

          onDeclined(request);
        }
      });

      subscriptions.push(sub);
    });

    return () => {
      ref.off();
      subscriptions.forEach((s) => s());
    };
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
```

**Update packages/transport-gun/src/index.ts:**
```typescript
export { SocialManager } from "./social-manager";
```

#### 3. CREATE SOCIAL STORE (apps/desktop)

**apps/desktop/src/stores/social-store.ts:**
```typescript
import { create } from "zustand";
import { SocialManager } from "@nodes/transport-gun";
import { DMCrypto } from "@nodes/crypto";
import type { FriendRequest, Friend, BlockedUser } from "@nodes/core";
import type { KeyPair } from "@nodes/crypto";
import type { Unsubscribe } from "@nodes/transport";
import { useToastStore } from "./toast-store";
import { useDMStore } from "./dm-store";

interface SocialState {
  // State
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  blockedUsers: BlockedUser[];
  isLoading: boolean;

  // Subscriptions
  inboxSub: Unsubscribe | null;
  outgoingSub: Unsubscribe | null;

  // Actions
  initialize: (myKey: string, keypair: KeyPair, knownKeys: string[]) => Promise<void>;
  sendRequest: (toKey: string, myKey: string, message?: string) => Promise<void>;
  acceptRequest: (requestId: string, fromKey: string, keypair: KeyPair) => Promise<void>;
  declineRequest: (requestId: string) => Promise<void>;
  removeFriend: (publicKey: string) => Promise<void>;
  blockUser: (publicKey: string) => Promise<void>;
  unblockUser: (publicKey: string) => Promise<void>;
  isFriend: (publicKey: string) => boolean;
  isBlocked: (publicKey: string) => boolean;
  initiateMessage: (targetKey: string, myKey: string, keypair: KeyPair) => Promise<void>;
  cleanup: () => void;
}

const socialManager = new SocialManager();

export const useSocialStore = create<SocialState>((set, get) => ({
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  blockedUsers: [],
  isLoading: false,
  inboxSub: null,
  outgoingSub: null,

  initialize: async (myKey, keypair, knownKeys) => {
    set({ isLoading: true });

    try {
      // Load friends
      const friends = await socialManager.getFriends();
      const blockedUsers = await socialManager.getBlockedUsers();

      // Check for incoming requests from known users (Node members)
      const incomingRequests = await socialManager.checkIncomingRequests(myKey, knownKeys);

      set({ friends, blockedUsers, incomingRequests, isLoading: false });

      // Subscribe to incoming request notifications
      const inboxSub = socialManager.subscribeInbox(myKey, async (requestId, fromKey) => {
        // Validate the request exists and is for us
        const request = await socialManager.getRequest(requestId);
        if (request && request.status === "pending" && request.toKey === myKey) {
          set((state) => {
            const exists = state.incomingRequests.some((r) => r.id === requestId);
            if (exists) return state;
            return {
              incomingRequests: [...state.incomingRequests, request],
            };
          });

          useToastStore.getState().addToast(
            "info",
            `New message request received.`
          );
        }
      });

      // Subscribe to outgoing request status changes
      const outgoingSub = socialManager.subscribeOutgoingRequests(
        myKey,
        // On accepted:
        async (request) => {
          set((state) => ({
            friends: [
              ...state.friends,
              { publicKey: request.toKey, addedAt: Date.now() },
            ],
            outgoingRequests: state.outgoingRequests.filter((r) => r.id !== request.id),
          }));

          // Auto-create DM conversation
          const dmStore = useDMStore.getState();
          await dmStore.startConversation(request.toKey, keypair);

          useToastStore.getState().addToast(
            "success",
            `Friend request accepted! You can now message each other.`
          );
        },
        // On declined:
        (request) => {
          set((state) => ({
            outgoingRequests: state.outgoingRequests.filter((r) => r.id !== request.id),
          }));

          useToastStore.getState().addToast(
            "info",
            `Your message request was declined.`
          );
        }
      );

      set({ inboxSub, outgoingSub });
    } catch (err: any) {
      set({ isLoading: false });
      useToastStore.getState().addToast("error", `Failed to load social data: ${err.message}`);
    }
  },

  sendRequest: async (toKey, myKey, message = "") => {
    try {
      const request = await socialManager.sendRequest(myKey, toKey, message);

      // Write notification to recipient's inbox
      await socialManager.writeRequestNotification(toKey, request.id, myKey);

      set((state) => ({
        outgoingRequests: [...state.outgoingRequests, request],
      }));

      useToastStore.getState().addToast("success", "Message request sent.");
    } catch (err: any) {
      if (err.message === "INCOMING_REQUEST_EXISTS") {
        useToastStore.getState().addToast(
          "info",
          "This user already sent you a request! Check your requests."
        );
      } else {
        useToastStore.getState().addToast("error", err.message);
      }
      throw err;
    }
  },

  acceptRequest: async (requestId, fromKey, keypair) => {
    try {
      await socialManager.acceptRequest(requestId);

      // Add to friends list
      set((state) => ({
        friends: [
          ...state.friends,
          { publicKey: fromKey, addedAt: Date.now() },
        ],
        incomingRequests: state.incomingRequests.filter((r) => r.id !== requestId),
      }));

      // Create DM conversation
      const dmStore = useDMStore.getState();
      await dmStore.startConversation(fromKey, keypair);

      useToastStore.getState().addToast("success", "Friend request accepted!");
    } catch (err: any) {
      useToastStore.getState().addToast("error", `Failed to accept: ${err.message}`);
    }
  },

  declineRequest: async (requestId) => {
    try {
      await socialManager.declineRequest(requestId);

      set((state) => ({
        incomingRequests: state.incomingRequests.filter((r) => r.id !== requestId),
      }));

      useToastStore.getState().addToast("info", "Request declined.");
    } catch (err: any) {
      useToastStore.getState().addToast("error", `Failed to decline: ${err.message}`);
    }
  },

  removeFriend: async (publicKey) => {
    try {
      await socialManager.removeFriend(publicKey);
      set((state) => ({
        friends: state.friends.filter((f) => f.publicKey !== publicKey),
      }));
      useToastStore.getState().addToast("info", "Friend removed.");
    } catch (err: any) {
      useToastStore.getState().addToast("error", err.message);
    }
  },

  blockUser: async (publicKey) => {
    try {
      await socialManager.blockUser(publicKey);
      set((state) => ({
        friends: state.friends.filter((f) => f.publicKey !== publicKey),
        blockedUsers: [
          ...state.blockedUsers,
          { publicKey, blockedAt: Date.now() },
        ],
      }));
      useToastStore.getState().addToast("info", "User blocked.");
    } catch (err: any) {
      useToastStore.getState().addToast("error", err.message);
    }
  },

  unblockUser: async (publicKey) => {
    try {
      await socialManager.unblockUser(publicKey);
      set((state) => ({
        blockedUsers: state.blockedUsers.filter((b) => b.publicKey !== publicKey),
      }));
      useToastStore.getState().addToast("info", "User unblocked.");
    } catch (err: any) {
      useToastStore.getState().addToast("error", err.message);
    }
  },

  isFriend: (publicKey) => {
    return get().friends.some((f) => f.publicKey === publicKey);
  },

  isBlocked: (publicKey) => {
    return get().blockedUsers.some((b) => b.publicKey === publicKey);
  },

  /**
   * The unified "Send Message" action.
   * This is what gets called when you click "Send Message" on a member.
   * It handles the full decision tree:
   *   → Friends? Open DM
   *   → Pending request from them? Prompt to accept
   *   → Pending request from us? Show "already sent"
   *   → Neither? Send request
   */
  initiateMessage: async (targetKey, myKey, keypair) => {
    const { isFriend, sendRequest } = get();

    if (isFriend(targetKey)) {
      // Already friends — open DM directly
      const dmStore = useDMStore.getState();
      const conversationId = DMCrypto.generateConversationId(myKey, targetKey);

      // Ensure conversation exists
      await dmStore.startConversation(targetKey, keypair);
      await dmStore.setActiveConversation(conversationId, targetKey, keypair);

      // Switch to DM view
      // (Import and use navigation store in the component calling this)
      return;
    }

    // Not friends — send a request
    await sendRequest(targetKey, myKey);
  },

  cleanup: () => {
    const { inboxSub, outgoingSub } = get();
    if (inboxSub) inboxSub();
    if (outgoingSub) outgoingSub();
    set({
      inboxSub: null,
      outgoingSub: null,
    });
  },
}));
```

#### 4. BUILD THE REQUEST UI

**apps/desktop/src/components/social/RequestsPanel.tsx:**

A panel accessible from the DM sidebar showing incoming and outgoing requests.

```
┌────────────────────────────┐
│  Message Requests (2)      │
├────────────────────────────┤
│                            │
│  INCOMING                  │
│  ┌──────────────────────┐  │
│  │ [T] testLev          │  │
│  │ "Hey, want to chat?" │  │
│  │ 2 minutes ago        │  │
│  │                      │  │
│  │ [Accept] [Decline]   │  │
│  └──────────────────────┘  │
│                            │
│  OUTGOING                  │
│  ┌──────────────────────┐  │
│  │ [K] kdogg            │  │
│  │ Pending...           │  │
│  │ 5 minutes ago        │  │
│  │                      │  │
│  │ [Cancel]             │  │
│  └──────────────────────┘  │
│                            │
└────────────────────────────┘
```

- Accessible via a bell/notification icon in the DM sidebar header
- Badge count on the icon showing number of pending incoming requests
- Each incoming request shows: sender avatar placeholder, display name (resolved), optional message, timestamp, Accept + Decline buttons
- Each outgoing request shows: recipient name, "Pending..." status, timestamp, Cancel button
- Empty state: "No pending requests"

#### 5. UPDATE MEMBER CONTEXT MENU

When clicking a member in MemberSidebar, the action should now go through `socialStore.initiateMessage()`:

- If friends → switch to DM mode, open conversation
- If not friends → send request, show toast "Message request sent"
- If they sent us a request → show toast "They sent you a request! Check your requests." (or auto-open the requests panel)
- If we already sent them a request → show toast "Request already pending"
- If blocked → don't show "Send Message" option at all

Add additional context menu options:
- "View Profile" (placeholder for now)
- "Add Friend" (same as initiateMessage but without switching to DM)
- "Block User" (with confirmation)

#### 6. ADD REQUEST BADGE TO SIDEBAR

In the NodeSidebar (left icon bar), the DM icon should show a badge with the count of incoming pending requests:

```typescript
const { incomingRequests } = useSocialStore();
const pendingCount = incomingRequests.length;

// On the DM icon:
{pendingCount > 0 && (
  <span className="absolute -top-1 -right-1 bg-nodes-danger text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
    {pendingCount}
  </span>
)}
```

#### 7. UPDATE DM GATING

**Critical change to DM flow:**

The DM system from Milestone 1.6 should now be gated by friendship:

- `DMSidebar` only shows conversations with users who are in the friends list
- `DMView` checks friendship status before allowing message send
- `NewDMModal` only shows friends as options (remove the "paste public key" option for non-friends)
- Or alternatively: "paste public key" sends a friend request instead of opening a DM

#### 8. INITIALIZE SOCIAL SYSTEM ON AUTH

In AppShell or a dedicated hook, initialize the social system after authentication:

```typescript
useEffect(() => {
  if (isAuthenticated && publicKey && keypair) {
    // Collect all known public keys from Nodes we're in
    const allMembers = Object.values(nodeStore.members)
      .flat()
      .map((m) => m.publicKey)
      .filter((k) => k !== publicKey);

    const uniqueKeys = [...new Set(allMembers)];

    socialStore.initialize(publicKey, keypair, uniqueKeys);
  }

  return () => {
    socialStore.cleanup();
  };
}, [isAuthenticated, publicKey]);
```

#### 9. UPDATE PRESENCE VISIBILITY

Update the member list and presence subscriptions to follow the visibility rules:

```typescript
/**
 * Can I see this user's presence?
 * 1. Are they in the same Node as me? → YES (community context)
 * 2. Are they my friend? → YES (always visible)
 * 3. Neither? → NO (show as "Unknown" or don't show at all)
 */
function canSeePresence(
  targetKey: string,
  sharedNodeMembers: string[],
  friends: string[]
): boolean {
  return sharedNodeMembers.includes(targetKey) || friends.includes(targetKey);
}
```

For Node member lists: always show presence (they share a Node).
For DM sidebar: show presence for all friends.

---

### COMPONENT FILE STRUCTURE

```
apps/desktop/src/
├── components/
│   └── social/
│       ├── RequestsPanel.tsx       # Incoming/outgoing request list
│       ├── RequestItem.tsx         # Single request with accept/decline
│       ├── FriendList.tsx          # Friend list (future settings panel)
│       ├── BlockedList.tsx         # Blocked users (future settings panel)
│       └── MemberContextMenu.tsx   # Right-click menu on member items
├── stores/
│   ├── social-store.ts
│   └── navigation-store.ts        # (if not already created in 1.6)
```

---

### VERIFICATION CHECKLIST

1. **Send request** — Click member → "Send Message" → toast "Message request sent"
2. **Request appears** — On recipient's side, request notification appears (badge + in requests panel)
3. **Accept request** — Recipient accepts → both users are now friends, DM conversation auto-created
4. **DM works after accept** — Both users can now send/receive DMs immediately
5. **Decline request** — Recipient declines → request removed from both sides
6. **Already friends** — Click "Send Message" on a friend → opens DM directly, no request
7. **Duplicate request** — Try to send request to someone you already requested → toast "Already sent"
8. **Reverse request** — A sends request to B, then B tries to send request to A → toast "They already sent you a request"
9. **Block user** — Block a user → they're removed from friends, can't send requests
10. **Unblock user** — Unblock → they can send requests again
11. **DM gated** — Cannot start a DM with a non-friend (no bypass)
12. **Presence in Nodes** — Members of the same Node see each other's presence (green dots)
13. **Presence for friends** — Friends always see each other's presence, even outside Nodes
14. **Request badge** — DM icon shows badge count for pending incoming requests
15. **Clean up on logout** — All subscriptions cleaned up, social state reset
16. **`pnpm lint`** — Clean
17. **`pnpm test`** — All tests pass

---

### NEXT MILESTONE

Once 1.7 is verified, proceed to **Milestone 1.8: Profile, Settings & Desktop Polish** which will:
- User profile editing panel (bio, status message, avatar placeholder)
- Status selector dropdown (online/idle/DND/invisible)
- Profile popup on clicking a user's name/avatar
- User settings page (change passphrase, export backup, manage blocked users)
- First production build — installable binary with app icon
- System tray integration for notification awareness
