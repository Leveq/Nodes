import { useEffect } from "react";
import { Search, Grid3X3, List, Compass } from "lucide-react";
import { useDiscoveryStore } from "../../stores/discovery-store";
import { directoryManager } from "@nodes/transport-gun";
import { NodeCard } from "./NodeCard";
import { CategoryFilter } from "./CategoryFilter";
import { NodePreviewModal } from "./NodePreviewModal";
import type { DirectorySortBy } from "@nodes/core";

const SORT_OPTIONS: { value: DirectorySortBy; label: string }[] = [
  { value: "members", label: "Most Members" },
  { value: "newest", label: "Newest" },
  { value: "alphabetical", label: "A-Z" },
];

/**
 * DiscoveryPage - Browse and discover public Nodes
 */
export function DiscoveryPage() {
  const listings = useDiscoveryStore((s) => s.listings);
  const filters = useDiscoveryStore((s) => s.filters);
  const isLoading = useDiscoveryStore((s) => s.isLoading);
  const viewMode = useDiscoveryStore((s) => s.viewMode);
  const selectedNode = useDiscoveryStore((s) => s.selectedNode);
  const setListings = useDiscoveryStore((s) => s.setListings);
  const setFilters = useDiscoveryStore((s) => s.setFilters);
  const setViewMode = useDiscoveryStore((s) => s.setViewMode);
  const setSelectedNode = useDiscoveryStore((s) => s.setSelectedNode);
  const getFilteredListings = useDiscoveryStore((s) => s.getFilteredListings);

  const filteredListings = getFilteredListings();

  // Subscribe to directory on mount
  useEffect(() => {
    const unsubscribe = directoryManager.subscribeDirectory((newListings) => {
      setListings(newListings);
    });

    // Also do an initial browse to populate faster
    directoryManager.browse().then(setListings);

    return unsubscribe;
  }, [setListings]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface-dark">
      {/* Header */}
      <div className="px-6 py-4 border-b border-surface-border">
        <div className="flex items-center gap-3 mb-4">
          <Compass className="w-6 h-6 text-accent" />
          <h1 className="text-xl font-semibold text-text-primary">
            Explore Public Nodes
          </h1>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-4 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              value={filters.search || ""}
              onChange={(e) => setFilters({ search: e.target.value })}
              placeholder="Search communities..."
              className="w-full pl-10 pr-4 py-2 bg-surface-medium rounded-lg border border-surface-border text-text-primary placeholder-text-muted text-sm outline-none focus:border-accent transition-colors"
            />
          </div>

          {/* Sort dropdown */}
          <select
            value={filters.sortBy}
            onChange={(e) =>
              setFilters({ sortBy: e.target.value as DirectorySortBy })
            }
            className="px-3 py-2 bg-[#1e1e24] rounded-lg border border-surface-border text-text-primary text-sm outline-none focus:border-accent cursor-pointer [&>option]:bg-[#1e1e24] [&>option]:text-text-primary"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {/* View mode toggle */}
          <div className="flex rounded-lg border border-surface-border overflow-hidden">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-2 transition-colors ${
                viewMode === "grid"
                  ? "bg-accent text-white"
                  : "bg-surface-medium text-text-muted hover:text-text-primary"
              }`}
              title="Grid view"
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-2 transition-colors ${
                viewMode === "list"
                  ? "bg-accent text-white"
                  : "bg-surface-medium text-text-muted hover:text-text-primary"
              }`}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Category filter */}
        <CategoryFilter />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-accent/30 border-t-accent rounded-full animate-spin" />
              <p className="text-text-muted text-sm">Loading directory...</p>
            </div>
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <Compass className="w-12 h-12 text-text-muted mx-auto mb-3 opacity-50" />
              <p className="text-text-secondary text-lg mb-1">
                {filters.search || filters.category || filters.tags?.length
                  ? "No Nodes match your filters"
                  : "No public Nodes yet"}
              </p>
              <p className="text-text-muted text-sm">
                {filters.search || filters.category || filters.tags?.length
                  ? "Try adjusting your search or filters"
                  : "Be the first to list your Node in the directory!"}
              </p>
            </div>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredListings.map((listing) => (
              <NodeCard
                key={listing.nodeId}
                listing={listing}
                onClick={() => setSelectedNode(listing)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredListings.map((listing) => (
              <NodeCard
                key={listing.nodeId}
                listing={listing}
                onClick={() => setSelectedNode(listing)}
                variant="list"
              />
            ))}
          </div>
        )}

        {/* Results count */}
        {!isLoading && filteredListings.length > 0 && (
          <p className="text-center text-text-muted text-sm mt-6">
            Showing {filteredListings.length} of {listings.length} public Nodes
          </p>
        )}
      </div>

      {/* Node preview modal */}
      {selectedNode && (
        <NodePreviewModal
          listing={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
