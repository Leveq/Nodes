import { create } from "zustand";
import { SocialManager } from "@nodes/transport-gun";
import type { FriendRequest, Friend, BlockedUser } from "@nodes/core";
import type { Unsubscribe } from "@nodes/transport";
import { useToastStore } from "./toast-store";

interface SocialState {
  // State
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  blockedUsers: BlockedUser[];
  isLoading: boolean;
  activeMyKey: string | null;

  // Active subscriptions
  friendsSub: Unsubscribe | null;
  outgoingSub: Unsubscribe | null;
  inboxSub: Unsubscribe | null;

  // Actions
  initialize: (myKey: string) => Promise<void>;
  sendRequest: (fromKey: string, toKey: string, message?: string) => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  declineRequest: (requestId: string) => Promise<void>;
  cancelRequest: (requestId: string) => Promise<void>;
  removeFriend: (publicKey: string) => Promise<void>;
  blockUser: (publicKey: string) => Promise<void>;
  unblockUser: (publicKey: string) => Promise<void>;
  isFriend: (publicKey: string) => boolean;
  isBlocked: (publicKey: string) => boolean;
  hasPendingRequest: (toKey: string) => boolean;
  checkIncomingFromMembers: (myKey: string, memberKeys: string[]) => Promise<void>;
  addIncomingRequest: (request: FriendRequest) => void;
  cleanup: () => void;
}

const socialManager = new SocialManager();

export const useSocialStore = create<SocialState>((set, get) => ({
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  blockedUsers: [],
  isLoading: false,
  activeMyKey: null,
  friendsSub: null,
  outgoingSub: null,
  inboxSub: null,

  initialize: async (myKey) => {
    set({ activeMyKey: myKey });

    const state = get();
    
    // Clean up old subscriptions
    state.friendsSub?.();
    state.outgoingSub?.();
    state.inboxSub?.();

    set({ isLoading: true });

    try {
      // Load initial data
      const [friends, blockedUsers, outgoingRequests] = await Promise.all([
        socialManager.getFriends(),
        socialManager.getBlockedUsers(),
        socialManager.getOutgoingRequests(myKey),
      ]);

      set({ friends, blockedUsers, outgoingRequests });

      // Subscribe to friends list changes
      const friendsSub = socialManager.subscribeFriends((friend, publicKey) => {
        set((state) => {
          if (!friend) {
            // Friend removed
            return {
              friends: state.friends.filter((f) => f.publicKey !== publicKey),
            };
          }
          // Friend added or updated
          const exists = state.friends.some((f) => f.publicKey === publicKey);
          if (exists) {
            return {
              friends: state.friends.map((f) =>
                f.publicKey === publicKey ? friend : f
              ),
            };
          }
          return { friends: [...state.friends, friend] };
        });
      });

      // Subscribe to outgoing request status changes
      const outgoingSub = socialManager.subscribeOutgoingRequests(
        myKey,
        (request) => {
          // Accepted — friend added automatically by SocialManager
          useToastStore
            .getState()
            .addToast("success", `Friend request accepted!`);
          // Remove from outgoing
          set((state) => ({
            outgoingRequests: state.outgoingRequests.filter(
              (r) => r.id !== request.id
            ),
          }));
        },
        (request) => {
          // Declined
          useToastStore
            .getState()
            .addToast("info", `Friend request was declined.`);
          set((state) => ({
            outgoingRequests: state.outgoingRequests.filter(
              (r) => r.id !== request.id
            ),
          }));
        }
      );

      // Subscribe to request inbox for real-time incoming
      const inboxSub = socialManager.subscribeInbox(myKey, async (requestId, fromKey) => {
        // Validate by checking the actual request
        const request = await socialManager.getRequest(requestId);
        if (get().activeMyKey !== myKey) {
          return; // Stale subscription — re-initialized with a different key
        }
        if (!request || request.status !== "pending" || request.toKey !== myKey) {
          return; // Invalid or already processed
        }

        // Check if from blocked user
        if (get().isBlocked(fromKey)) {
          return;
        }

        // Check if we already have this request
        const { incomingRequests } = get();
        if (incomingRequests.some((r) => r.id === requestId)) {
          return;
        }

        // Add to incoming
        set((state) => ({
          incomingRequests: [...state.incomingRequests, request],
        }));

        useToastStore.getState().addToast("info", "You have a new friend request!");
      });

      set({
        friendsSub,
        outgoingSub,
        inboxSub,
        isLoading: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore
        .getState()
        .addToast("error", `Failed to initialize social: ${message}`);
      set({ isLoading: false });
    }
  },

  sendRequest: async (fromKey, toKey, message = "") => {
    const { isBlocked, isFriend, hasPendingRequest } = get();

    if (isBlocked(toKey)) {
      useToastStore.getState().addToast("error", "Cannot send request to a blocked user.");
      return;
    }

    if (isFriend(toKey)) {
      useToastStore.getState().addToast("info", "You are already friends with this user.");
      return;
    }

    if (hasPendingRequest(toKey)) {
      useToastStore.getState().addToast("info", "You already have a pending request to this user.");
      return;
    }

    try {
      const request = await socialManager.sendRequest(fromKey, toKey, message);

      // Write notification to recipient's inbox
      await socialManager.writeRequestNotification(toKey, request.id, fromKey);

      // Add to our outgoing
      set((state) => ({
        outgoingRequests: [...state.outgoingRequests, request],
      }));

      useToastStore.getState().addToast("success", "Friend request sent!");
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : "Unknown error";

      if (errMsg === "INCOMING_REQUEST_EXISTS") {
        useToastStore
          .getState()
          .addToast("info", "This user already sent you a request! Check your requests.");
        return;
      }

      useToastStore.getState().addToast("error", `Failed to send request: ${errMsg}`);
    }
  },

  acceptRequest: async (requestId) => {
    try {
      await socialManager.acceptRequest(requestId);

      // Remove from incoming
      set((state) => ({
        incomingRequests: state.incomingRequests.filter((r) => r.id !== requestId),
      }));

      useToastStore.getState().addToast("success", "Friend request accepted!");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to accept request: ${message}`);
    }
  },

  declineRequest: async (requestId) => {
    try {
      await socialManager.declineRequest(requestId);

      set((state) => ({
        incomingRequests: state.incomingRequests.filter((r) => r.id !== requestId),
      }));

      useToastStore.getState().addToast("info", "Friend request declined.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to decline request: ${message}`);
    }
  },

  cancelRequest: async (requestId) => {
    try {
      await socialManager.cancelRequest(requestId);

      set((state) => ({
        outgoingRequests: state.outgoingRequests.filter((r) => r.id !== requestId),
      }));

      useToastStore.getState().addToast("info", "Friend request cancelled.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to cancel request: ${message}`);
    }
  },

  removeFriend: async (publicKey) => {
    try {
      await socialManager.removeFriend(publicKey);

      set((state) => ({
        friends: state.friends.filter((f) => f.publicKey !== publicKey),
      }));

      useToastStore.getState().addToast("info", "Friend removed.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to remove friend: ${message}`);
    }
  },

  blockUser: async (publicKey) => {
    try {
      await socialManager.blockUser(publicKey);

      set((state) => ({
        blockedUsers: [
          ...state.blockedUsers,
          { publicKey, blockedAt: Date.now() },
        ],
        friends: state.friends.filter((f) => f.publicKey !== publicKey),
        incomingRequests: state.incomingRequests.filter(
          (r) => r.fromKey !== publicKey
        ),
        outgoingRequests: state.outgoingRequests.filter(
          (r) => r.toKey !== publicKey
        ),
      }));

      useToastStore.getState().addToast("info", "User blocked.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to block user: ${message}`);
    }
  },

  unblockUser: async (publicKey) => {
    try {
      await socialManager.unblockUser(publicKey);

      set((state) => ({
        blockedUsers: state.blockedUsers.filter((b) => b.publicKey !== publicKey),
      }));

      useToastStore.getState().addToast("info", "User unblocked.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      useToastStore.getState().addToast("error", `Failed to unblock user: ${message}`);
    }
  },

  isFriend: (publicKey) => {
    return get().friends.some((f) => f.publicKey === publicKey);
  },

  isBlocked: (publicKey) => {
    return get().blockedUsers.some((b) => b.publicKey === publicKey);
  },

  hasPendingRequest: (toKey) => {
    return get().outgoingRequests.some((r) => r.toKey === toKey && r.status === "pending");
  },

  /**
   * Check for incoming requests from known Node members.
   * Called when Node membership loads so we can display requests
   * from users we share Nodes with.
   */
  checkIncomingFromMembers: async (myKey, memberKeys) => {
    try {
      const requests = await socialManager.checkIncomingRequests(myKey, memberKeys);
      const { incomingRequests, isBlocked } = get();

      // Filter out blocked and already-tracked
      const newRequests = requests.filter(
        (r) =>
          !isBlocked(r.fromKey) &&
          !incomingRequests.some((existing) => existing.id === r.id)
      );

      if (newRequests.length > 0) {
        set((state) => ({
          incomingRequests: [...state.incomingRequests, ...newRequests],
        }));
      }
    } catch {
      // Fail silently — inbox subscription will also catch new requests
    }
  },

  addIncomingRequest: (request) => {
    const { incomingRequests, isBlocked } = get();

    if (isBlocked(request.fromKey)) return;
    if (incomingRequests.some((r) => r.id === request.id)) return;

    set((state) => ({
      incomingRequests: [...state.incomingRequests, request],
    }));
  },

  cleanup: () => {
    const { friendsSub, outgoingSub, inboxSub } = get();
    friendsSub?.();
    outgoingSub?.();
    inboxSub?.();

    set({
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
      blockedUsers: [],
      activeMyKey: null,
      friendsSub: null,
      outgoingSub: null,
      inboxSub: null,
    });
  },
}));
