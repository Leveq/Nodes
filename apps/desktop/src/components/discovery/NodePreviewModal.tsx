import { useState, useEffect } from "react";
import { X, Users, Calendar, Crown, Hash, Volume2, Ban, Check, Loader2 } from "lucide-react";
import type { DirectoryListing } from "@nodes/core";
import { CATEGORY_LABELS, CATEGORY_ICONS } from "@nodes/core";
import { NodeManager, ModerationManager } from "@nodes/transport-gun";
import { useNodeStore } from "../../stores/node-store";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";

const nodeManager = new NodeManager();
const moderationManager = new ModerationManager();

interface NodePreviewModalProps {
  listing: DirectoryListing;
  onClose: () => void;
}

type JoinStatus = "idle" | "loading" | "joined" | "banned";

/**
 * NodePreviewModal - Full preview of a Node before joining
 */
export function NodePreviewModal({ listing, onClose }: NodePreviewModalProps) {
  const publicKey = useIdentityStore((s) => s.publicKey);
  const nodes = useNodeStore((s) => s.nodes);
  const loadUserNodes = useNodeStore((s) => s.loadUserNodes);
  const setActiveNode = useNodeStore((s) => s.setActiveNode);
  const refreshMembers = useNodeStore((s) => s.refreshMembers);
  const addToast = useToastStore((s) => s.addToast);

  const [joinStatus, setJoinStatus] = useState<JoinStatus>("idle");

  // Check if already a member
  const isAlreadyMember = nodes.some((n) => n.id === listing.nodeId);

  // Check if banned on mount
  useEffect(() => {
    if (!publicKey || isAlreadyMember) return;

    async function checkBan() {
      const isBanned = await moderationManager.isBanned(listing.nodeId, publicKey!);
      if (isBanned) {
        setJoinStatus("banned");
      }
    }
    checkBan();
  }, [publicKey, listing.nodeId, isAlreadyMember]);

  // Handle join
  const handleJoin = async () => {
    if (!publicKey) return;
    if (joinStatus === "banned" || joinStatus === "loading") return;

    setJoinStatus("loading");

    try {
      await nodeManager.joinNodeDirect(listing.nodeId, listing.inviteKey, publicKey);
      setJoinStatus("joined");
      addToast("success", `Joined ${listing.name}!`);

      // Reload user nodes and navigate
      await loadUserNodes();
      setActiveNode(listing.nodeId);
      
      // Refresh members after a short delay to allow Gun to propagate
      setTimeout(() => {
        refreshMembers(listing.nodeId);
      }, 500);
      
      onClose();
    } catch (error) {
      setJoinStatus("idle");
      addToast("error", error instanceof Error ? error.message : "Failed to join Node");
    }
  };

  // Get icon to display
  const getNodeIcon = () => {
    if (listing.icon?.startsWith("Qm") || listing.icon?.startsWith("bafy")) {
      return (
        <img
          src={`https://ipfs.io/ipfs/${listing.icon}`}
          alt={listing.name}
          className="w-full h-full object-cover"
        />
      );
    }
    return (
      <span className="text-4xl">
        {listing.icon || listing.name.charAt(0).toUpperCase()}
      </span>
    );
  };

  // Format date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
  };

  // Separate text and voice channels
  const textChannels = listing.channelNames.filter(
    (name) => !name.toLowerCase().includes("voice") && !name.toLowerCase().includes("vc")
  );
  const voiceChannels = listing.channelNames.filter(
    (name) => name.toLowerCase().includes("voice") || name.toLowerCase().includes("vc")
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-overlayIn"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 glass-panel rounded-xl w-full max-w-lg max-h-[85vh] overflow-hidden animate-modalIn shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-4 p-6 border-b border-surface-border">
          {/* Icon */}
          <div className="w-16 h-16 rounded-xl bg-surface-dark flex items-center justify-center overflow-hidden flex-shrink-0">
            {getNodeIcon()}
          </div>

          {/* Title */}
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-semibold text-text-primary truncate mb-1">
              {listing.name}
            </h2>
            <span className="inline-flex items-center gap-1.5 text-sm text-text-muted">
              {CATEGORY_ICONS[listing.category]} {CATEGORY_LABELS[listing.category]}
            </span>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-light transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {/* Description */}
          <p className="text-text-secondary mb-4 whitespace-pre-wrap">
            {listing.description || listing.shortDescription || "No description provided."}
          </p>

          {/* Stats */}
          <div className="flex flex-wrap gap-4 mb-4 text-sm text-text-muted">
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              {listing.memberCount.toLocaleString()} members
            </span>
            <span className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4" />
              Created {formatDate(listing.createdAt)}
            </span>
            <span className="flex items-center gap-1.5">
              <Crown className="w-4 h-4" />
              {listing.ownerName || listing.ownerKey.slice(0, 8)}
            </span>
          </div>

          {/* Channels */}
          {listing.channelNames.length > 0 && (
            <div className="mb-4">
              <h3 className="text-sm font-medium text-text-primary mb-2">
                Channels
              </h3>
              <div className="flex flex-wrap gap-2">
                {textChannels.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded bg-surface-dark text-text-secondary"
                  >
                    <Hash className="w-3.5 h-3.5" />
                    {name}
                  </span>
                ))}
                {voiceChannels.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 text-sm px-2 py-1 rounded bg-surface-dark text-text-secondary"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tags */}
          {listing.tags.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-text-primary mb-2">
                Tags
              </h3>
              <div className="flex flex-wrap gap-2">
                {listing.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-sm px-2.5 py-1 rounded-full bg-accent/10 text-accent"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-surface-border bg-surface-dark/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>

          {isAlreadyMember ? (
            <button
              disabled
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600/20 text-green-400 rounded-lg text-sm cursor-not-allowed"
            >
              <Check className="w-4 h-4" />
              Already Joined
            </button>
          ) : joinStatus === "banned" ? (
            <button
              disabled
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600/20 text-red-400 rounded-lg text-sm cursor-not-allowed"
            >
              <Ban className="w-4 h-4" />
              You are banned
            </button>
          ) : joinStatus === "loading" ? (
            <button
              disabled
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm cursor-not-allowed opacity-70"
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              Joining...
            </button>
          ) : (
            <button
              onClick={handleJoin}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Check className="w-4 h-4" />
              Join Node
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
