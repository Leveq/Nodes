import { NODE_CATEGORIES, CATEGORY_LABELS, CATEGORY_ICONS } from "@nodes/core";
import type { NodeCategory } from "@nodes/core";
import { useDiscoveryStore } from "../../stores/discovery-store";

/**
 * CategoryFilter - Horizontal pills for filtering by category
 */
export function CategoryFilter() {
  const category = useDiscoveryStore((s) => s.filters.category);
  const tags = useDiscoveryStore((s) => s.filters.tags);
  const popularTags = useDiscoveryStore((s) => s.popularTags);
  const setFilters = useDiscoveryStore((s) => s.setFilters);
  const clearFilters = useDiscoveryStore((s) => s.clearFilters);

  const handleCategoryClick = (cat: NodeCategory) => {
    if (category === cat) {
      // Toggle off
      setFilters({ category: undefined });
    } else {
      setFilters({ category: cat });
    }
  };

  const handleTagClick = (tag: string) => {
    if (tags?.includes(tag)) {
      // Remove tag
      setFilters({ tags: tags.filter((t) => t !== tag) });
    } else {
      // Add tag
      setFilters({ tags: [...(tags || []), tag] });
    }
  };

  const hasActiveFilters = category || (tags && tags.length > 0);

  return (
    <div className="space-y-3">
      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        {NODE_CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => handleCategoryClick(cat)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors ${
              category === cat
                ? "bg-accent text-white"
                : "bg-surface-medium text-text-secondary hover:bg-surface-light hover:text-text-primary"
            }`}
          >
            <span>{CATEGORY_ICONS[cat]}</span>
            <span>{CATEGORY_LABELS[cat]}</span>
          </button>
        ))}
      </div>

      {/* Popular tags (only show if we have some) */}
      {popularTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-text-muted">Popular:</span>
          {popularTags.slice(0, 8).map((tag) => (
            <button
              key={tag}
              onClick={() => handleTagClick(tag)}
              className={`text-xs px-2 py-1 rounded-full transition-colors ${
                tags?.includes(tag)
                  ? "bg-accent/20 text-accent"
                  : "bg-surface-dark text-text-muted hover:text-text-secondary"
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Clear filters button (only when filters active) */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="text-xs text-accent hover:text-accent-hover transition-colors"
        >
          Clear all filters
        </button>
      )}
    </div>
  );
}
