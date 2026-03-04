import { create } from "zustand";
import { SocialManager, ProfileManager } from "@nodes/transport-gun";
import type { FriendRequest, Friend, BlockedUser } from "@nodes/core";
import type { Unsubscribe } from "@nodes/transport";
import { useToastStore } from "./toast-store";
import { processFriendRequestNotification } from "../services/notification-manager";

const profileManager = new ProfileManager();

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
  unfriendSub: Unsubscribe | null;
  acceptedSub: Unsubscribe | null;
  cancelledSub: Unsubscribe | null;
  declinedSub: Unsubscribe | null;

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
  unfriendSub: null,
  acceptedSub: null,
  cancelledSub: null,
  declinedSub: null,

  initialize: async (myKey) => {
    set({ activeMyKey: myKey });

    const state = get();
    
    // Clean up old subscriptions
    state.friendsSub?.();
    state.outgoingSub?.();
    state.inboxSub?.();
    state.unfriendSub?.();
    state.acceptedSub?.();
    state.cancelledSub?.();
    state.declinedSub?.();

    set({ isLoading: true });

    try {
      // Load initial data
      const [friendsRaw, blockedUsers, outgoingRequests] = await Promise.all([
        socialManager.getFriends(),
        socialManager.getBlockedUsers(),
        socialManager.getOutgoingRequests(myKey),
      ]);

      // Filter out self from friends list (guard against corrupt data)
      const friends = friendsRaw.filter((f) => f.publicKey !== myKey);

      set({ friends, blockedUsers, outgoingRequests });

      // Subscribe to friends list changes
      const friendsSub = socialManager.subscribeFriends((friend, publicKey) => {
        // Guard against self being in friends list (corrupt data)
        if (publicKey === myKey) {
          console.warn("[SocialStore] Ignoring self in friends list");
          return;
        }
        
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
      // Note: Toasts are shown by acceptedSub/declinedSub to avoid duplicates
      const outgoingSub = socialManager.subscribeOutgoingRequests(
        myKey,
        (request) => {
          // Accepted — friend added automatically by SocialManager
          // Toast handled by acceptedSub subscription (more reliable)
          // Remove from outgoing
          set((state) => ({
            outgoingRequests: state.outgoingRequests.filter(
              (r) => r.id !== request.id
            ),
          }));
        },
        (request) => {
          // Declined — toast handled by declinedSub subscription (more reliable)
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

        // Get sender's display name for notification
        let senderName = fromKey.slice(0, 8) + "...";
        try {
          const profile = await profileManager.getPublicProfile(fromKey);
          if (profile?.displayName) {
            senderName = profile.displayName;
          }
        } catch {
          // Use truncated key as fallback
        }

        // Add to bell icon notifications + show desktop notification
        await processFriendRequestNotification(fromKey, senderName, request.message);

        useToastStore.getState().addToast("info", "You have a new friend request!");
      });

      // Subscribe to unfriend inbox for real-time unfriend detection
      const unfriendSub = socialManager.subscribeUnfriendInbox(myKey, async (fromKey) => {
        if (get().activeMyKey !== myKey) {
          return; // Stale subscription
        }

        // Check if this person is actually in our friends list
        const { friends } = get();
        const wasFriend = friends.some((f) => f.publicKey === fromKey);
        
        if (wasFriend) {
          // Remove from our friends list (local state)
          set((state) => ({
            friends: state.friends.filter((f) => f.publicKey !== fromKey),
          }));
          
          // ALSO remove from our Gun graph so it doesn't come back on reload
          await socialManager.removeFriendFromGraph(fromKey);
          
          useToastStore.getState().addToast("info", "A friend has removed you from their friends list.");
        }
        // Note: We don't clear the notification - we rely on timestamp comparison
        // to detect new unfriend events. Clearing can cause Gun.js to not fire
        // on subsequent writes to the same path.
      });

      // Subscribe to accepted-inbox for real-time acceptance detection
      // This fires when someone accepts our friend request
      const acceptedSub = socialManager.subscribeAcceptedInbox(myKey, (acceptorKey, requestId) => {
        if (get().activeMyKey !== myKey) {
          return; // Stale subscription
        }

        console.log("[SocialStore] Friend request accepted via inbox:", acceptorKey.slice(0, 8));
        
        // Check if we already have them as a friend (avoid duplicates)
        const { friends, outgoingRequests } = get();
        const alreadyFriend = friends.some((f) => f.publicKey === acceptorKey);
        
        if (!alreadyFriend && acceptorKey !== myKey) {
          // Add to friends list
          set((state) => ({
            friends: [...state.friends, { publicKey: acceptorKey, addedAt: Date.now() }],
          }));
        }
        
        // Remove from outgoing requests
        const hadRequest = outgoingRequests.some((r) => r.id === requestId);
        if (hadRequest) {
          set((state) => ({
            outgoingRequests: state.outgoingRequests.filter((r) => r.id !== requestId),
          }));
          useToastStore.getState().addToast("success", "Friend request accepted!");
        }
      });

      // Subscribe to cancelled-inbox for real-time cancellation detection
      // This fires when someone cancels a friend request they sent us
      const cancelledSub = socialManager.subscribeCancelledInbox(myKey, (requestId, _fromKey) => {
        if (get().activeMyKey !== myKey) {
          return; // Stale subscription
        }

        console.log("[SocialStore] Friend request cancelled:", requestId);
        
        // Remove from incoming requests
        set((state) => ({
          incomingRequests: state.incomingRequests.filter((r) => r.id !== requestId),
        }));
      });

      // Subscribe to declined-inbox for real-time decline detection
      // This fires when someone declines our friend request
      const declinedSub = socialManager.subscribeDeclinedInbox(myKey, (requestId) => {
        if (get().activeMyKey !== myKey) {
          return; // Stale subscription
        }

        console.log("[SocialStore] Friend request declined:", requestId);
        
        // Remove from outgoing requests
        set((state) => ({
          outgoingRequests: state.outgoingRequests.filter((r) => r.id !== requestId),
        }));
        
        useToastStore.getState().addToast("info", "Friend request was declined.");
      });

      set({
        friendsSub,
        outgoingSub,
        inboxSub,
        unfriendSub,
        acceptedSub,
        cancelledSub,
        declinedSub,
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
    const { activeMyKey } = get();
    if (!activeMyKey) {
      useToastStore.getState().addToast("error", "Not authenticated");
      return;
    }

    try {
      await socialManager.removeFriend(publicKey, activeMyKey);

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
    const { friendsSub, outgoingSub, inboxSub, unfriendSub, acceptedSub, cancelledSub, declinedSub } = get();
    friendsSub?.();
    outgoingSub?.();
    inboxSub?.();
    unfriendSub?.();
    acceptedSub?.();
    cancelledSub?.();
    declinedSub?.();

    set({
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
      blockedUsers: [],
      activeMyKey: null,
      friendsSub: null,
      outgoingSub: null,
      inboxSub: null,
      unfriendSub: null,
      acceptedSub: null,
      cancelledSub: null,
      declinedSub: null,
    });
  },
}));
