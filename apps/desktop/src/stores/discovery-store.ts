import { create } from "zustand";
import type { DirectoryListing, DirectoryFilters, NodeCategory } from "@nodes/core";

interface DiscoveryStore {
  listings: DirectoryListing[];
  filters: DirectoryFilters;
  isLoading: boolean;
  selectedNode: DirectoryListing | null;
  viewMode: "grid" | "list";
  popularTags: string[];

  setListings: (listings: DirectoryListing[]) => void;
  setFilters: (filters: Partial<DirectoryFilters>) => void;
  clearFilters: () => void;
  setIsLoading: (loading: boolean) => void;
  setSelectedNode: (node: DirectoryListing | null) => void;
  setViewMode: (mode: "grid" | "list") => void;
  reset: () => void;

  // Computed: filtered and sorted listings
  getFilteredListings: () => DirectoryListing[];
}

export const useDiscoveryStore = create<DiscoveryStore>((set, get) => ({
  listings: [],
  filters: { sortBy: "members" },
  isLoading: true,
  selectedNode: null,
  viewMode: "grid",
  popularTags: [],

  setListings: (listings) => {
    // Extract popular tags from listings
    const tagCounts = new Map<string, number>();
    listings.forEach((l) => {
      l.tags.forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });
    const popularTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);

    set({ listings, isLoading: false, popularTags });
  },

  setFilters: (filters) =>
    set((state) => ({ filters: { ...state.filters, ...filters } })),

  clearFilters: () =>
    set({ filters: { sortBy: "members" } }),

  setIsLoading: (isLoading) => set({ isLoading }),
  setSelectedNode: (node) => set({ selectedNode: node }),
  setViewMode: (mode) => set({ viewMode: mode }),

  reset: () => set({
    listings: [],
    filters: { sortBy: "members" },
    isLoading: true,
    selectedNode: null,
    viewMode: "grid",
    popularTags: [],
  }),

  getFilteredListings: () => {
    const { listings, filters } = get();
    let filtered = [...listings];

    // Text search
    if (filters.search && filters.search.length >= 2) {
      const lower = filters.search.toLowerCase();
      filtered = filtered.filter(
        (l) =>
          l.name.toLowerCase().includes(lower) ||
          l.shortDescription.toLowerCase().includes(lower) ||
          l.tags.some((t) => t.includes(lower))
      );
    }

    // Category filter
    if (filters.category) {
      filtered = filtered.filter((l) => l.category === filters.category);
    }

    // Tag filter
    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter((l) =>
        filters.tags!.some((tag) => l.tags.includes(tag))
      );
    }

    // Sort
    switch (filters.sortBy) {
      case "members":
        filtered.sort((a, b) => b.memberCount - a.memberCount);
        break;
      case "newest":
        filtered.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case "alphabetical":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return filtered;
  },
}));
