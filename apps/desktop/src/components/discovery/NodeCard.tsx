import { Users, Clock } from "lucide-react";
import type { DirectoryListing } from "@nodes/core";
import { CATEGORY_LABELS, CATEGORY_ICONS } from "@nodes/core";
import { useDiscoveryStore } from "../../stores/discovery-store";

interface NodeCardProps {
  listing: DirectoryListing;
  onClick: () => void;
  variant?: "grid" | "list";
}

/**
 * NodeCard - Display card for a Node in the discovery directory
 */
export function NodeCard({ listing, onClick, variant = "grid" }: NodeCardProps) {
  const setFilters = useDiscoveryStore((s) => s.setFilters);

  // Calculate days since last refresh
  const daysSinceRefresh = Math.floor(
    (Date.now() - listing.lastRefreshed) / (1000 * 60 * 60 * 24)
  );
  const isStale = daysSinceRefresh > 7;

  // Get icon to display (IPFS image or emoji/letter)
  const getNodeIcon = () => {
    if (listing.icon?.startsWith("Qm") || listing.icon?.startsWith("bafy")) {
      // IPFS CID - render as image
      return (
        <img
          src={`https://ipfs.io/ipfs/${listing.icon}`}
          alt={listing.name}
          className="w-full h-full object-cover"
        />
      );
    }
    // Emoji or fallback to first letter
    return (
      <span className="text-2xl">
        {listing.icon || listing.name.charAt(0).toUpperCase()}
      </span>
    );
  };

  // Handle tag click (filter by tag)
  const handleTagClick = (e: React.MouseEvent, tag: string) => {
    e.stopPropagation();
    setFilters({ tags: [tag] });
  };

  if (variant === "list") {
    return (
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-4 p-4 rounded-lg border border-surface-border bg-surface-medium hover:bg-surface-light hover:border-accent/50 hover:shadow-[0_0_12px_rgba(99,102,241,0.3)] transition-all text-left ${
          isStale ? "opacity-60" : ""
        }`}
      >
        {/* Icon */}
        <div className="w-12 h-12 rounded-lg bg-surface-dark flex items-center justify-center overflow-hidden flex-shrink-0">
          {getNodeIcon()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <h3 className="font-semibold text-text-primary truncate">
              {listing.name}
            </h3>
            <span className="text-xs px-1.5 py-0.5 rounded bg-surface-dark text-text-muted flex-shrink-0">
              {CATEGORY_ICONS[listing.category]}{" "}
              {CATEGORY_LABELS[listing.category]}
            </span>
          </div>
          <p className="text-sm text-text-secondary line-clamp-1">
            {listing.shortDescription || listing.description || "No description"}
          </p>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 flex-shrink-0 text-text-muted text-sm">
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {listing.memberCount.toLocaleString()}
          </span>
          {isStale && (
            <span className="flex items-center gap-1 text-yellow-500">
              <Clock className="w-4 h-4" />
              {daysSinceRefresh}d ago
            </span>
          )}
        </div>
      </button>
    );
  }

  // Grid variant (default)
  return (
    <button
      onClick={onClick}
      className={`flex flex-col p-4 rounded-xl border border-surface-border bg-surface-medium hover:bg-surface-light hover:border-accent/50 hover:shadow-[0_0_15px_rgba(99,102,241,0.35)] hover:-translate-y-0.5 transition-all text-left h-full ${
        isStale ? "opacity-60" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        {/* Icon */}
        <div className="w-12 h-12 rounded-lg bg-surface-dark flex items-center justify-center overflow-hidden flex-shrink-0">
          {getNodeIcon()}
        </div>

        {/* Name & category */}
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-text-primary truncate mb-0.5">
            {listing.name}
          </h3>
          <span className="text-xs text-text-muted">
            {CATEGORY_ICONS[listing.category]}{" "}
            {CATEGORY_LABELS[listing.category]}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-text-secondary line-clamp-2 flex-1 mb-3">
        {listing.shortDescription || listing.description || "No description"}
      </p>

      {/* Tags */}
      {listing.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {listing.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              onClick={(e) => handleTagClick(e, tag)}
              className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent hover:bg-accent/20 cursor-pointer transition-colors"
            >
              #{tag}
            </span>
          ))}
          {listing.tags.length > 3 && (
            <span className="text-xs text-text-muted">
              +{listing.tags.length - 3} more
            </span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-2 border-t border-surface-border text-text-muted text-xs">
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          {listing.memberCount.toLocaleString()} members
        </span>
        {isStale && (
          <span className="flex items-center gap-1 text-yellow-500">
            <Clock className="w-3.5 h-3.5" />
            {daysSinceRefresh}d ago
          </span>
        )}
      </div>
    </button>
  );
}
