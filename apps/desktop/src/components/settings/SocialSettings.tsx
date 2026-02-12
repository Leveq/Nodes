import { useState, useEffect } from "react";
import { useSocialStore } from "../../stores/social-store";
import { useToastStore } from "../../stores/toast-store";
import { ProfileManager } from "@nodes/transport-gun";

const profileManager = new ProfileManager();

/**
 * Social settings section: friends list, blocked users, pending requests.
 */
export function SocialSettings() {
  const friends = useSocialStore((s) => s.friends);
  const blockedUsers = useSocialStore((s) => s.blockedUsers);
  const outgoingRequests = useSocialStore((s) => s.outgoingRequests);
  const removeFriend = useSocialStore((s) => s.removeFriend);
  const unblockUser = useSocialStore((s) => s.unblockUser);
  const cancelRequest = useSocialStore((s) => s.cancelRequest);
  const addToast = useToastStore((s) => s.addToast);

  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  // Resolve display names
  useEffect(() => {
    const keys = [
      ...friends.map((f) => f.publicKey),
      ...blockedUsers.map((b) => b.publicKey),
      ...outgoingRequests.map((r) => r.toKey),
    ];

    const resolveNames = async () => {
      const names: Record<string, string> = { ...resolvedNames };
      let hasNew = false;

      for (const key of keys) {
        if (!names[key]) {
          hasNew = true;
          try {
            const profile = await profileManager.getPublicProfile(key);
            names[key] = profile?.displayName || key.slice(0, 8);
          } catch {
            names[key] = key.slice(0, 8);
          }
        }
      }

      if (hasNew) setResolvedNames(names);
    };

    if (keys.length > 0) resolveNames();
  }, [friends, blockedUsers, outgoingRequests]);

  const handleUnfriend = async (publicKey: string, name: string) => {
    if (!confirm(`Remove ${name} as a friend? You won't be able to DM each other.`)) return;
    
    try {
      await removeFriend(publicKey);
      addToast("success", `Removed ${name} from friends`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove friend";
      addToast("error", message);
    }
  };

  const handleUnblock = async (publicKey: string, name: string) => {
    try {
      await unblockUser(publicKey);
      addToast("success", `Unblocked ${name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to unblock user";
      addToast("error", message);
    }
  };

  const handleCancelRequest = async (requestId: string, name: string) => {
    try {
      await cancelRequest(requestId);
      addToast("success", `Cancelled request to ${name}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to cancel request";
      addToast("error", message);
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="space-y-8">
      {/* Friends List */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">
          Friends ({friends.length})
        </h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Friends can see your presence and send you direct messages.
        </p>
        {friends.length === 0 ? (
          <div className="py-8 text-center text-nodes-text-muted text-sm">
            No friends yet. Send a message request to someone to become friends.
          </div>
        ) : (
          <div className="space-y-2">
            {friends.map((friend) => {
              const name = resolvedNames[friend.publicKey] || friend.publicKey.slice(0, 8);
              const initial = name[0]?.toUpperCase() || "?";

              return (
                <div
                  key={friend.publicKey}
                  className="flex items-center gap-3 px-3 py-2 bg-nodes-bg rounded-lg"
                >
                  <div className="w-10 h-10 rounded-full bg-nodes-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-nodes-primary font-medium">{initial}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-nodes-text font-medium truncate">{name}</div>
                    <div className="text-xs text-nodes-text-muted">
                      Friends since {formatDate(friend.addedAt)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnfriend(friend.publicKey, name)}
                    className="px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    Unfriend
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Pending Outgoing Requests */}
      {outgoingRequests.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-nodes-text mb-3">
            Pending Requests ({outgoingRequests.length})
          </h2>
          <div className="space-y-2">
            {outgoingRequests.map((request) => {
              const name = resolvedNames[request.toKey] || request.toKey.slice(0, 8);
              const initial = name[0]?.toUpperCase() || "?";

              return (
                <div
                  key={request.id}
                  className="flex items-center gap-3 px-3 py-2 bg-nodes-bg rounded-lg"
                >
                  <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0">
                    <span className="text-yellow-500 font-medium">{initial}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-nodes-text font-medium truncate">{name}</div>
                    <div className="text-xs text-nodes-text-muted">
                      Sent {formatDate(request.createdAt)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleCancelRequest(request.id, name)}
                    className="px-3 py-1.5 text-sm text-nodes-text-muted hover:text-nodes-text hover:bg-nodes-surface rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Blocked Users */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">
          Blocked Users ({blockedUsers.length})
        </h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Blocked users cannot send you friend requests or messages.
        </p>
        {blockedUsers.length === 0 ? (
          <div className="py-8 text-center text-nodes-text-muted text-sm">
            No blocked users.
          </div>
        ) : (
          <div className="space-y-2">
            {blockedUsers.map((blocked) => {
              const name = resolvedNames[blocked.publicKey] || blocked.publicKey.slice(0, 8);
              const initial = name[0]?.toUpperCase() || "?";

              return (
                <div
                  key={blocked.publicKey}
                  className="flex items-center gap-3 px-3 py-2 bg-nodes-bg rounded-lg"
                >
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                    <span className="text-red-400 font-medium">{initial}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-nodes-text font-medium truncate">{name}</div>
                    <div className="text-xs text-nodes-text-muted">
                      Blocked {formatDate(blocked.blockedAt)}
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnblock(blocked.publicKey, name)}
                    className="px-3 py-1.5 text-sm text-nodes-text-muted hover:text-nodes-text hover:bg-nodes-surface rounded-lg transition-colors"
                  >
                    Unblock
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
