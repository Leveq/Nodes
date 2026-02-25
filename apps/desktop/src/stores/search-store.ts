import { create } from "zustand";
import type { SearchScope, SearchResult, SearchQuery, SearchFilters } from "@nodes/core";

interface SearchState {
  // UI state
  isOpen: boolean;
  isLoading: boolean;
  
  // Query state
  rawQuery: string;
  parsedQuery: SearchQuery | null;
  scope: SearchScope;
  
  // Results
  results: SearchResult[];
  selectedIndex: number;
  totalResults: number;
  
  // Index stats
  indexedDocuments: number;
  
  // Filter context (for "in:" and "from:" filters)
  currentNodeId: string | null;
  currentChannelId: string | null;
  
  // Actions
  open: () => void;
  close: () => void;
  toggle: () => void;
  setQuery: (query: string) => void;
  setScope: (scope: SearchScope) => void;
  setResults: (results: SearchResult[], total?: number) => void;
  setLoading: (loading: boolean) => void;
  setSelectedIndex: (index: number) => void;
  selectNext: () => void;
  selectPrevious: () => void;
  setContext: (nodeId: string | null, channelId: string | null) => void;
  setIndexedDocuments: (count: number) => void;
  reset: () => void;
}

/**
 * Parse search query string into structured query object
 * 
 * Supported filters:
 * - from:@username or from:publicKey - filter by author
 * - in:#channel or in:channelId - filter by channel  
 * - before:2024-01-15 or before:yesterday - date filter
 * - after:2024-01-15 or after:lastweek - date filter
 * - has:file, has:image, has:link - content type filter
 */
function parseQuery(raw: string): SearchQuery {
  const filters: SearchFilters = {};
  const terms: string[] = [];
  
  // Match filter patterns
  const filterRegex = /(\w+):(\S+)/g;
  let match;
  let lastIndex = 0;
  
  const cleanedQuery = raw.replace(filterRegex, (fullMatch, key, value, offset) => {
    // Collect non-filter text before this match
    const before = raw.slice(lastIndex, offset).trim();
    if (before) {
      terms.push(...before.split(/\s+/).filter(Boolean));
    }
    lastIndex = offset + fullMatch.length;
    
    const lowerKey = key.toLowerCase();
    const cleanValue = value.replace(/^[@#]/, ""); // Remove @ or # prefix
    
    switch (lowerKey) {
      case "from":
        filters.from = cleanValue;
        break;
      case "in":
        filters.in = cleanValue;
        break;
      case "before":
        filters.before = parseDate(cleanValue);
        break;
      case "after":
        filters.after = parseDate(cleanValue);
        break;
      case "has":
        if (cleanValue === "file" || cleanValue === "image" || cleanValue === "link") {
          filters.has = cleanValue;
        }
        break;
    }
    
    return ""; // Remove filter from query string
  });
  
  // Add any remaining text as search terms
  const remainder = raw.slice(lastIndex).trim();
  if (remainder) {
    terms.push(...remainder.split(/\s+/).filter(Boolean));
  }
  
  return {
    raw,
    terms,
    filters,
  };
}

/**
 * Parse date string into Date object
 * Supports: YYYY-MM-DD, "yesterday", "lastweek", "lastmonth"
 */
function parseDate(value: string): Date | undefined {
  const lower = value.toLowerCase();
  const now = new Date();
  
  switch (lower) {
    case "yesterday":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "lastweek":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "lastmonth":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      // Try parsing as ISO date
      const parsed = new Date(value);
      return isNaN(parsed.getTime()) ? undefined : parsed;
  }
}

export const useSearchStore = create<SearchState>((set, get) => ({
  // Initial state
  isOpen: false,
  isLoading: false,
  rawQuery: "",
  parsedQuery: null,
  scope: "all-nodes", // Default to all-nodes for better discoverability
  results: [],
  selectedIndex: 0,
  totalResults: 0,
  indexedDocuments: 0,
  currentNodeId: null,
  currentChannelId: null,
  
  // Actions
  open: () => set({ isOpen: true }),
  
  close: () => set({ 
    isOpen: false,
    rawQuery: "",
    parsedQuery: null,
    results: [],
    selectedIndex: 0,
  }),
  
  toggle: () => {
    const { isOpen } = get();
    if (isOpen) {
      get().close();
    } else {
      get().open();
    }
  },
  
  setQuery: (query: string) => {
    const parsedQuery = parseQuery(query);
    set({ 
      rawQuery: query, 
      parsedQuery,
      selectedIndex: 0,
    });
  },
  
  setScope: (scope: SearchScope) => set({ scope, selectedIndex: 0 }),
  
  setResults: (results: SearchResult[], total?: number) => set({ 
    results, 
    totalResults: total ?? results.length,
    selectedIndex: 0,
  }),
  
  setLoading: (loading: boolean) => set({ isLoading: loading }),
  
  setSelectedIndex: (index: number) => {
    const { results } = get();
    set({ selectedIndex: Math.max(0, Math.min(index, results.length - 1)) });
  },
  
  selectNext: () => {
    const { selectedIndex, results } = get();
    if (selectedIndex < results.length - 1) {
      set({ selectedIndex: selectedIndex + 1 });
    }
  },
  
  selectPrevious: () => {
    const { selectedIndex } = get();
    if (selectedIndex > 0) {
      set({ selectedIndex: selectedIndex - 1 });
    }
  },
  
  setContext: (nodeId: string | null, channelId: string | null) => set({
    currentNodeId: nodeId,
    currentChannelId: channelId,
  }),
  
  setIndexedDocuments: (count: number) => set({ indexedDocuments: count }),
  
  reset: () => set({
    isOpen: false,
    isLoading: false,
    rawQuery: "",
    parsedQuery: null,
    scope: "all-nodes",
    results: [],
    selectedIndex: 0,
    totalResults: 0,
    indexedDocuments: 0,
    currentNodeId: null,
    currentChannelId: null,
  }),
}));
