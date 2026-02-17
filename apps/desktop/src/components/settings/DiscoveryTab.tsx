import { useState, useEffect } from "react";
import { useNodeStore } from "../../stores/node-store";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import { directoryManager } from "@nodes/transport-gun";
import { NODE_CATEGORIES, CATEGORY_LABELS, CATEGORY_ICONS } from "@nodes/core";
import type { NodeCategory, DirectoryListing } from "@nodes/core";
import { Button, Input } from "../ui";
import { Globe, GlobeLock, Loader2, Eye, X } from "lucide-react";
import { NodeCard } from "../discovery/NodeCard";

/**
 * DiscoveryTab - Settings for listing a Node in the public directory.
 * Only visible to Node owners.
 */
export function DiscoveryTab() {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const nodes = useNodeStore((s) => s.nodes);
  const channels = useNodeStore((s) => s.channels);
  const members = useNodeStore((s) => s.members);
  const publicKey = useIdentityStore((s) => s.publicKey);
  const displayName = useIdentityStore((s) => s.displayName);
  const addToast = useToastStore((s) => s.addToast);

  const node = nodes.find((n) => n.id === activeNodeId);
  const nodeChannels = activeNodeId ? (channels[activeNodeId] || []) : [];
  const nodeMembers = activeNodeId ? (members[activeNodeId] || []) : [];

  // State
  const [isListed, setIsListed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [shortDescription, setShortDescription] = useState("");
  const [category, setCategory] = useState<NodeCategory>("other");
  const [tagsInput, setTagsInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [listedAt, setListedAt] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Refresh members when tab opens to ensure accurate count
  const loadMembers = useNodeStore((s) => s.loadMembers);
  
  // Load current listing status on mount
  useEffect(() => {
    if (!activeNodeId) return;

    // Refresh members to get accurate count
    loadMembers(activeNodeId);

    async function loadListing() {
      setIsLoading(true);
      try {
        const listing = await directoryManager.getListing(activeNodeId!);
        if (listing) {
          setIsListed(true);
          setShortDescription(listing.shortDescription);
          setCategory(listing.category);
          setTags(listing.tags);
          setListedAt(listing.listedAt);
        } else {
          setIsListed(false);
          setShortDescription(node?.description?.slice(0, 150) || "");
          setCategory("other");
          setTags([]);
          setListedAt(null);
        }
      } catch (error) {
        console.error("[DiscoveryTab] Failed to load listing:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadListing();
  }, [activeNodeId, node?.description, loadMembers]);

  // Handle tag input
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  };

  const addTag = () => {
    const newTag = tagsInput
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "")
      .slice(0, 20);

    if (newTag && tags.length < 5 && !tags.includes(newTag)) {
      setTags([...tags, newTag]);
    }
    setTagsInput("");
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

  // Handle listing toggle
  const handleToggleListing = async () => {
    if (!activeNodeId || !node || !publicKey) return;

    setIsSaving(true);
    try {
      if (isListed) {
        // Delist
        await directoryManager.delistNode(activeNodeId);
        setIsListed(false);
        setListedAt(null);
        addToast("success", "Node removed from directory");
      } else {
        // List
        const listing: DirectoryListing = {
          nodeId: activeNodeId,
          name: node.name,
          shortDescription: shortDescription || node.description || "",
          description: node.description || "",
          icon: node.icon || "",
          category,
          tags,
          memberCount: nodeMembers.length,
          channelCount: nodeChannels.length,
          channelNames: nodeChannels.map((c) => c.name),
          ownerKey: publicKey,
          ownerName: displayName || publicKey.slice(0, 8),
          inviteKey: node.inviteKey,
          createdAt: node.createdAt,
          listedAt: Date.now(),
          lastRefreshed: Date.now(),
        };

        await directoryManager.listNode(listing);
        setIsListed(true);
        setListedAt(Date.now());
        addToast("success", "Node listed in directory!");
      }
    } catch (error) {
      addToast(
        "error",
        error instanceof Error ? error.message : "Failed to update listing"
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Handle saving changes (when already listed)
  const handleSaveChanges = async () => {
    if (!activeNodeId || !node || !publicKey || !isListed) return;

    setIsSaving(true);
    try {
      const listing: DirectoryListing = {
        nodeId: activeNodeId,
        name: node.name,
        shortDescription: shortDescription || node.description || "",
        description: node.description || "",
        icon: node.icon || "",
        category,
        tags,
        memberCount: nodeMembers.length,
        channelCount: nodeChannels.length,
        channelNames: nodeChannels.map((c) => c.name),
        ownerKey: publicKey,
        ownerName: displayName || publicKey.slice(0, 8),
        inviteKey: node.inviteKey,
        createdAt: node.createdAt,
        listedAt: listedAt || Date.now(),
        lastRefreshed: Date.now(),
      };

      await directoryManager.listNode(listing);
      addToast("success", "Listing updated!");
    } catch (error) {
      addToast(
        "error",
        error instanceof Error ? error.message : "Failed to update listing"
      );
    } finally {
      setIsSaving(false);
    }
  };

  // Build preview listing
  const previewListing: DirectoryListing | null = node && publicKey ? {
    nodeId: node.id,
    name: node.name,
    shortDescription: shortDescription || node.description || "",
    description: node.description || "",
    icon: node.icon || "",
    category,
    tags,
    memberCount: nodeMembers.length,
    channelCount: nodeChannels.length,
    channelNames: nodeChannels.map((c) => c.name),
    ownerKey: publicKey,
    ownerName: displayName || publicKey.slice(0, 8),
    inviteKey: node.inviteKey,
    createdAt: node.createdAt,
    listedAt: listedAt || Date.now(),
    lastRefreshed: Date.now(),
  } : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-text-muted animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Listing toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg border border-surface-border bg-surface-dark">
        <div className="flex items-center gap-3">
          {isListed ? (
            <Globe className="w-6 h-6 text-green-400" />
          ) : (
            <GlobeLock className="w-6 h-6 text-text-muted" />
          )}
          <div>
            <h3 className="font-medium text-text-primary">
              {isListed ? "Listed in Public Directory" : "Not Listed"}
            </h3>
            <p className="text-sm text-text-muted">
              {isListed
                ? `Listed since ${new Date(listedAt!).toLocaleDateString()}`
                : "List your Node so others can discover and join it"}
            </p>
          </div>
        </div>
        <Button
          variant={isListed ? "secondary" : "primary"}
          onClick={handleToggleListing}
          disabled={isSaving}
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isListed ? (
            "Remove from Directory"
          ) : (
            "List in Directory"
          )}
        </Button>
      </div>

      {/* Listing details (only show when listed or about to list) */}
      <div className={`space-y-4 ${!isListed ? "opacity-60 pointer-events-none" : ""}`}>
        {/* Short description */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Short Description
            <span className="text-text-muted font-normal ml-2">
              ({shortDescription.length}/150)
            </span>
          </label>
          <Input
            value={shortDescription}
            onChange={setShortDescription}
            maxLength={150}
            placeholder="A brief description for the directory card..."
          />
          <p className="mt-1 text-xs text-text-muted">
            This appears on your Node card in the directory. Keep it short and catchy.
          </p>
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as NodeCategory)}
            className="w-full px-3 py-2 bg-[#1e1e24] rounded-lg border border-surface-border text-text-primary text-sm outline-none focus:border-accent cursor-pointer [&>option]:bg-[#1e1e24] [&>option]:text-text-primary"
          >
            {NODE_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
              </option>
            ))}
          </select>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-text-primary mb-1.5">
            Tags
            <span className="text-text-muted font-normal ml-2">
              ({tags.length}/5)
            </span>
          </label>

          {/* Current tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 text-accent text-sm"
                >
                  #{tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Tag input */}
          {tags.length < 5 && (
            <Input
              value={tagsInput}
              onChange={setTagsInput}
              onKeyDown={handleTagKeyDown}
              onBlur={addTag}
              placeholder="Type a tag and press Enter..."
              maxLength={20}
            />
          )}
          <p className="mt-1 text-xs text-text-muted">
            Add up to 5 tags to help people find your Node. Use lowercase, no spaces.
          </p>
        </div>

        {/* Preview button */}
        <Button
          variant="secondary"
          onClick={() => setShowPreview(!showPreview)}
          className="w-full"
        >
          <Eye className="w-4 h-4 mr-2" />
          {showPreview ? "Hide Preview" : "Preview Card"}
        </Button>

        {/* Card preview */}
        {showPreview && previewListing && (
          <div className="p-4 rounded-lg border border-surface-border bg-surface-dark">
            <p className="text-xs text-text-muted mb-3 uppercase">
              Preview (how it appears in the directory)
            </p>
            <div className="max-w-xs">
              <NodeCard
                listing={previewListing}
                onClick={() => {}}
              />
            </div>
          </div>
        )}

        {/* Save button (when listed) */}
        {isListed && (
          <Button
            variant="primary"
            onClick={handleSaveChanges}
            disabled={isSaving}
            className="w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              "Update Listing"
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
