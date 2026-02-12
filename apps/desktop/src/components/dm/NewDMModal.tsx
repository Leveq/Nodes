import { useState, useMemo, useEffect } from "react";
import { Modal } from "../modals/Modal";
import { Input } from "../ui";
import { useDMStore } from "../../stores/dm-store";
import { useSocialStore } from "../../stores/social-store";
import { useIdentityStore } from "../../stores/identity-store";
import { useNavigationStore } from "../../stores/navigation-store";
import { ProfileManager } from "@nodes/transport-gun";
import type { KeyPair } from "@nodes/crypto";

const profileManager = new ProfileManager();

interface NewDMModalProps {
  onClose: () => void;
}

/**
 * Modal to start a new DM conversation.
 * Now only shows friends (DMs are gated behind friend system).
 */
export function NewDMModal({ onClose }: NewDMModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolvedNames, setResolvedNames] = useState<Record<string, string>>({});

  const startConversation = useDMStore((s) => s.startConversation);
  const setActiveConversation = useDMStore((s) => s.setActiveConversation);
  const friends = useSocialStore((s) => s.friends);
  const keypair = useIdentityStore((s) => s.keypair);
  const setViewMode = useNavigationStore((s) => s.setViewMode);

  // Resolve display names for friends
  useEffect(() => {
    async function resolveNames() {
      const names: Record<string, string> = { ...resolvedNames };
      let hasNew = false;

      for (const friend of friends) {
        if (!names[friend.publicKey]) {
          hasNew = true;
          try {
            const profile = await profileManager.getPublicProfile(friend.publicKey);
            names[friend.publicKey] = profile?.displayName || friend.publicKey.slice(0, 8);
          } catch {
            names[friend.publicKey] = friend.publicKey.slice(0, 8);
          }
        }
      }

      if (hasNew) {
        setResolvedNames(names);
      }
    }
    resolveNames();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resolvedNames intentionally excluded
  }, [friends]);

  // Filter friends by search
  const filteredFriends = useMemo(() => {
    if (!searchQuery) return friends;
    const lower = searchQuery.toLowerCase();
    return friends.filter((f) => {
      const name = resolvedNames[f.publicKey] || f.publicKey;
      return (
        name.toLowerCase().includes(lower) ||
        f.publicKey.toLowerCase().includes(lower)
      );
    });
  }, [friends, searchQuery, resolvedNames]);

  const handleSelectFriend = async (publicKey: string) => {
    if (!keypair) return;
    setIsSubmitting(true);

    try {
      const conversationId = await startConversation(publicKey, keypair as KeyPair);
      await setActiveConversation(conversationId, publicKey, keypair as KeyPair);
      setViewMode("dm");
      onClose();
    } catch {
      // Error already shown via toast
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="New Message" onClose={onClose}>
      <div className="space-y-4">
        {/* Search */}
        <Input
          placeholder="Search friends..."
          value={searchQuery}
          onChange={setSearchQuery}
        />

        {/* Friend list */}
        <div className="max-h-64 overflow-y-auto space-y-1">
          {filteredFriends.length === 0 ? (
            <p className="text-nodes-text-muted text-sm text-center py-4">
              {friends.length === 0
                ? "No friends yet. Add friends from the member list in any Node!"
                : "No friends match your search."}
            </p>
          ) : (
            filteredFriends.map((friend) => (
              <button
                key={friend.publicKey}
                onClick={() => handleSelectFriend(friend.publicKey)}
                disabled={isSubmitting}
                className="w-full px-3 py-2 flex items-center gap-3 rounded hover:bg-nodes-bg transition-colors disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded-full bg-nodes-primary/20 flex items-center justify-center">
                  <span className="text-nodes-primary text-sm font-medium">
                    {(resolvedNames[friend.publicKey] || "?")[0].toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 text-left">
                  <p className="text-nodes-text text-sm font-medium">
                    {resolvedNames[friend.publicKey] || friend.publicKey.slice(0, 8)}
                  </p>
                  <p className="text-nodes-text-muted text-xs truncate">
                    {friend.publicKey.slice(0, 20)}...
                  </p>
                </div>
              </button>
            ))
          )}
        </div>

        <p className="text-xs text-nodes-text-muted text-center">
          Messages are end-to-end encrypted. Only you and the recipient can read them.
        </p>
      </div>
    </Modal>
  );
}
