import { useCallback, useEffect, useRef } from "react";
import { useSearchStore } from "../stores/search-store";
import { getSearchIndex } from "../services/search-index";
import { useNodeStore } from "../stores/node-store";
import type { SearchFilters } from "@nodes/core";

/**
 * Hook for search functionality
 * 
 * Provides:
 * - Query execution with debouncing
 * - Result filtering by scope
 * - Keyboard navigation (up/down/enter/escape)
 * - Navigation to selected result
 */
export function useSearch() {
  const {
    isOpen,
    isLoading,
    rawQuery,
    parsedQuery,
    scope,
    results,
    selectedIndex,
    totalResults,
    currentNodeId,
    currentChannelId,
    open,
    close,
    toggle,
    setQuery,
    setScope,
    setResults,
    setLoading,
    setSelectedIndex,
    selectNext,
    selectPrevious,
    setContext,
  } = useSearchStore();
  
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const activeChannelId = useNodeStore((s) => s.activeChannelId);
  const setActiveNode = useNodeStore((s) => s.setActiveNode);
  const setActiveChannel = useNodeStore((s) => s.setActiveChannel);
  
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indexRef = useRef(getSearchIndex());
  
  // Update context when navigation changes
  useEffect(() => {
    setContext(activeNodeId, activeChannelId);
  }, [activeNodeId, activeChannelId, setContext]);
  
  // Initialize search index on mount
  useEffect(() => {
    indexRef.current.initialize().catch(console.error);
  }, []);
  
  /**
   * Execute search with current query and scope
   */
  const executeSearch = useCallback(() => {
    console.log(`[useSearch] executeSearch - query: "${rawQuery}", terms: ${parsedQuery?.terms.length}, scope: ${scope}`);
    
    if (!parsedQuery || !parsedQuery.terms.length) {
      setResults([]);
      return;
    }
    
    setLoading(true);
    
    try {
      const index = indexRef.current;
      const queryText = parsedQuery.terms.join(" ");
      
      console.log(`[useSearch] Searching for: "${queryText}", currentChannelId: ${currentChannelId}, currentNodeId: ${currentNodeId}`);
      
      // Build filters based on scope
      const filters: SearchFilters = { ...parsedQuery.filters };
      
      switch (scope) {
        case "current-channel":
          if (currentChannelId) {
            filters.in = currentChannelId;
          }
          break;
        case "current-node":
          // Filter by nodeId in post-processing
          break;
        case "dms":
          // Only search DM type documents
          break;
        case "all-nodes":
          // No scope filter
          break;
      }
      
      // Execute search
      let searchResults = index.search(queryText, filters, 100);
      
      // Apply scope-based filtering
      if (scope === "current-node" && currentNodeId) {
        searchResults = searchResults.filter((r) => r.nodeId === currentNodeId);
      } else if (scope === "dms") {
        searchResults = searchResults.filter((r) => r.type === "dm");
      }
      
      setResults(searchResults.slice(0, 50), searchResults.length);
    } catch (error) {
      console.error("[useSearch] Search error:", error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [parsedQuery, scope, currentChannelId, currentNodeId, setResults, setLoading]);
  
  // Debounced search execution
  useEffect(() => {
    if (!isOpen) return;
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      executeSearch();
    }, 150);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [rawQuery, scope, isOpen, executeSearch]);
  
  /**
   * Navigate to a search result
   */
  const navigateToResult = useCallback((index?: number) => {
    const resultIndex = index ?? selectedIndex;
    const result = results[resultIndex];
    
    if (!result) return;
    
    // Close search first
    close();
    
    if (result.type === "message" && result.channelId && result.nodeId) {
      // Navigate to the node and channel
      setActiveNode(result.nodeId);
      setActiveChannel(result.channelId);
      
      // Dispatch event to scroll to message
      setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("scroll-to-message", {
            detail: {
              messageId: result.id,
              channelId: result.channelId,
              highlight: true,
            },
          })
        );
      }, 100);
    } else if (result.type === "dm" && result.conversationId) {
      // Navigate to DM conversation
      // TODO: Implement DM navigation when DM view is updated
      console.log("[useSearch] Navigate to DM:", result.conversationId);
    }
  }, [results, selectedIndex, close, setActiveNode, setActiveChannel]);
  
  /**
   * Handle keyboard events in search overlay
   */
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        selectNext();
        break;
      case "ArrowUp":
        event.preventDefault();
        selectPrevious();
        break;
      case "Enter":
        event.preventDefault();
        navigateToResult();
        break;
      case "Escape":
        event.preventDefault();
        close();
        break;
    }
  }, [selectNext, selectPrevious, navigateToResult, close]);
  
  return {
    // State
    isOpen,
    isLoading,
    query: rawQuery,
    parsedQuery,
    scope,
    results,
    selectedIndex,
    totalResults,
    
    // Actions
    open,
    close,
    toggle,
    setQuery,
    setScope,
    setSelectedIndex,
    navigateToResult,
    handleKeyDown,
    
    // Index reference for external access
    searchIndex: indexRef.current,
  };
}

/**
 * Hook for accessing search index directly
 * Useful for components that need to add documents to the index
 */
export function useSearchIndex() {
  const indexRef = useRef(getSearchIndex());
  
  useEffect(() => {
    indexRef.current.initialize().catch(console.error);
  }, []);
  
  return indexRef.current;
}
