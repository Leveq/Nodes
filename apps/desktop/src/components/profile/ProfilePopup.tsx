import { useState, useEffect, useRef } from "react";
import { useIdentityStore } from "../../stores/identity-store";
import { useSocialStore } from "../../stores/social-store";
import { useNodeStore } from "../../stores/node-store";
import { useDMStore } from "../../stores/dm-store";
import { useNavigationStore } from "../../stores/navigation-store";
import { useToastStore } from "../../stores/toast-store";
import { Avatar } from "../ui";
import { getStatusColor } from "../../utils/status";
import type { ProfileData } from "@nodes/transport-gun";
import type { KeyPair } from "@nodes/crypto";

interface ProfilePopupProps {
  publicKey: string;
  onClose: () => void;
  onEditProfile?: () => void;
  position?: { x: number; y: number };
}

/**
 * Profile popup card shown when clicking any user's name/avatar.
 */
export function ProfilePopup({ publicKey, onClose, onEditProfile, position }: ProfilePopupProps) {
  const myPublicKey = useIdentityStore((s) => s.publicKey);
  const keypair = useIdentityStore((s) => s.keypair);
  const myProfile = useIdentityStore((s) => s.profile);
  const resolveProfile = useIdentityStore((s) => s.resolveProfile);
  
  const isFriend = useSocialStore((s) => s.isFriend);
  const sendRequest = useSocialStore((s) => s.sendRequest);
  const hasPendingRequest = useSocialStore((s) => s.hasPendingRequest);
  const removeFriend = useSocialStore((s) => s.removeFriend);
  const blockUser = useSocialStore((s) => s.blockUser);
  
  const nodes = useNodeStore((s) => s.nodes);
  const members = useNodeStore((s) => s.members);
  
  const startConversation = useDMStore((s) => s.startConversation);
  const setActiveConversation = useDMStore((s) => s.setActiveConversation);
  const conversations = useDMStore((s) => s.conversations);
  
  const setViewMode = useNavigationStore((s) => s.setViewMode);
  const addToast = useToastStore((s) => s.addToast);
  
  const [profile, setProfile] = useState<Partial<ProfileData> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showMenu, setShowMenu] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);

  const isOwnProfile = publicKey === myPublicKey;
  const isFriendStatus = isFriend(publicKey);
  const hasPending = hasPendingRequest(publicKey);

  // Load profile data
  useEffect(() => {
    const loadProfile = async () => {
      if (isOwnProfile && myProfile) {
        setProfile(myProfile.data);
        setIsLoading(false);
        return;
      }

      try {
        const data = await resolveProfile(publicKey);
        setProfile(data);
      } catch {
        setProfile(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadProfile();
  }, [publicKey, isOwnProfile, myProfile, resolveProfile]);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Calculate mutual nodes
  const mutualNodes = nodes.filter((node) => {
    const nodeMembers = members[node.id] || [];
    return nodeMembers.some((m) => m.publicKey === publicKey);
  });

  const displayName = profile?.displayName || publicKey.slice(0, 8);
  const bio = profile?.bio || "";
  const status = (profile?.status as string) || "offline";
  const visibility = profile?.visibility || "public";

  const handleSendMessage = async () => {
    if (!keypair) return;
    
    try {
      // Check if conversation exists
      const existingConv = conversations.find((c) => c.recipientKey === publicKey);
      
      if (existingConv) {
        await setActiveConversation(existingConv.id, publicKey, keypair as KeyPair);
      } else if (isFriendStatus) {
        const convId = await startConversation(publicKey, keypair as KeyPair);
        await setActiveConversation(convId, publicKey, keypair as KeyPair);
      } else {
        // Need to send friend request first
        await sendRequest(myPublicKey!, publicKey);
        addToast("success", `Friend request sent to ${displayName}`);
        onClose();
        return;
      }
      
      setViewMode("dm");
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start conversation";
      addToast("error", message);
    }
  };

  const handleAddFriend = async () => {
    if (!myPublicKey) return;
    
    try {
      await sendRequest(myPublicKey, publicKey);
      addToast("success", `Friend request sent to ${displayName}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send request";
      addToast("error", message);
    }
    setShowMenu(false);
  };

  const handleUnfriend = async () => {
    try {
      await removeFriend(publicKey);
      addToast("success", `Removed ${displayName} from friends`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove friend";
      addToast("error", message);
    }
    setShowMenu(false);
  };

  const handleBlock = async () => {
    try {
      await blockUser(publicKey);
      addToast("success", `Blocked ${displayName}`);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to block user";
      addToast("error", message);
    }
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(publicKey);
    addToast("success", "Public key copied");
    setShowMenu(false);
  };

  return (
    <>
      {/* Backdrop - always show to allow click-outside close */}
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-overlayIn" onClick={onClose} />
      
      <div
        ref={popupRef}
        className={`w-80 glass-panel rounded-xl overflow-hidden z-50 animate-modalIn ${
          position ? "" : "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        }`}
        style={position ? {
          position: "fixed",
          left: Math.min(position.x, window.innerWidth - 320),
          top: Math.min(position.y, window.innerHeight - 400),
        } : undefined}
      >
      {isLoading ? (
        <div className="p-8 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-nodes-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="bg-nodes-bg/50 p-4 flex items-center gap-3">
            <Avatar
              publicKey={publicKey}
              displayName={displayName}
              size="lg"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-nodes-text truncate">{displayName}</span>
                <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(status)}`} />
              </div>
              <span className="text-xs text-nodes-text-muted capitalize">{visibility}</span>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3 text-sm">
            {bio && (
              <div>
                <h4 className="text-xs font-semibold text-nodes-text-muted uppercase mb-1">About Me</h4>
                <p className="text-nodes-text">{bio}</p>
              </div>
            )}

            <div>
              <h4 className="text-xs font-semibold text-nodes-text-muted uppercase mb-1">Member Since</h4>
              <p className="text-nodes-text">February 2026</p>
            </div>

            {mutualNodes.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-nodes-text-muted uppercase mb-1">Mutual Nodes</h4>
                <p className="text-nodes-text">{mutualNodes.map((n) => n.name).join(", ")}</p>
              </div>
            )}
          </div>

          {/* Actions */}
          {isOwnProfile ? (
            <div className="p-3 border-t border-nodes-border">
              <button
                onClick={() => {
                  onClose();
                  onEditProfile?.();
                }}
                className="w-full bg-nodes-primary hover:bg-nodes-primary/90 text-white py-2 rounded-lg font-medium text-sm transition-colors"
              >
                Edit Profile
              </button>
            </div>
          ) : (
            <div className="p-3 border-t border-nodes-border flex items-center gap-2">
              <button
                onClick={handleSendMessage}
                className="flex-1 bg-nodes-primary hover:bg-nodes-primary/90 text-white py-2 rounded-lg font-medium text-sm transition-colors"
              >
                {isFriendStatus ? "Send Message" : "Send Request"}
              </button>
              
              {/* More menu */}
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-2 text-nodes-text-muted hover:text-nodes-text hover:bg-nodes-bg rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>

                {showMenu && (
                  <div className="absolute bottom-full right-0 mb-1 w-48 bg-nodes-surface border border-nodes-border rounded-lg shadow-lg overflow-hidden">
                    {isFriendStatus ? (
                      <button
                        onClick={handleUnfriend}
                        className="w-full px-3 py-2 text-left text-sm text-nodes-text hover:bg-nodes-bg transition-colors"
                      >
                        Unfriend
                      </button>
                    ) : !hasPending ? (
                      <button
                        onClick={handleAddFriend}
                        className="w-full px-3 py-2 text-left text-sm text-nodes-text hover:bg-nodes-bg transition-colors"
                      >
                        Add Friend
                      </button>
                    ) : (
                      <span className="block px-3 py-2 text-sm text-nodes-text-muted">
                        Request Pending
                      </span>
                    )}
                    <button
                      onClick={handleBlock}
                      className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-nodes-bg transition-colors"
                    >
                      Block User
                    </button>
                    <button
                      onClick={handleCopyKey}
                      className="w-full px-3 py-2 text-left text-sm text-nodes-text hover:bg-nodes-bg transition-colors"
                    >
                      Copy Public Key
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
    </>
  );
}
