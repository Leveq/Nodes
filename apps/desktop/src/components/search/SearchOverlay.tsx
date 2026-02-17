import { useEffect, useRef } from "react";
import { useSearch } from "../../hooks/useSearch";
import { SearchResultItem } from "./SearchResultItem";
import type { SearchScope } from "@nodes/core";

const SCOPE_OPTIONS: { value: SearchScope; label: string }[] = [
  { value: "current-channel", label: "Current Channel" },
  { value: "current-node", label: "Current Node" },
  { value: "all-nodes", label: "All Nodes" },
  { value: "dms", label: "Direct Messages" },
];

/**
 * Search overlay component - spotlight-style search dialog
 * Triggered by Ctrl+K keyboard shortcut
 */
export function SearchOverlay() {
  const {
    isOpen,
    isLoading,
    query,
    scope,
    results,
    selectedIndex,
    totalResults,
    setQuery,
    setScope,
    close,
    navigateToResult,
    handleKeyDown,
  } = useSearch();
  
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  
  // Focus input when overlay opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);
  
  // Scroll selected result into view
  useEffect(() => {
    if (resultsRef.current && results.length > 0) {
      const selectedEl = resultsRef.current.querySelector(
        `[data-index="${selectedIndex}"]`
      );
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [selectedIndex, results.length]);
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-overlayIn"
        onClick={close}
      />
      
      {/* Search panel */}
      <div
        className="relative z-10 glass-panel rounded-xl w-full max-w-2xl animate-modalIn shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-border">
          {/* Search icon */}
          <svg
            className="w-5 h-5 text-text-muted flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search messages... (from:@user in:#channel after:yesterday)"
            className="flex-1 bg-transparent text-text-primary placeholder-text-muted outline-none text-base"
          />
          
          {/* Loading indicator */}
          {isLoading && (
            <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
          )}
          
          {/* Close button */}
          <button
            onClick={close}
            className="text-text-muted hover:text-text-primary transition-colors p-1"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        
        {/* Scope selector */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-surface-border bg-surface-secondary/30">
          <span className="text-xs text-text-muted">Search in:</span>
          {SCOPE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => setScope(option.value)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                scope === option.value
                  ? "bg-accent text-white"
                  : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        
        {/* Results list */}
        <div
          ref={resultsRef}
          className="max-h-[50vh] overflow-y-auto scrollbar-thin scrollbar-thumb-surface-border"
        >
          {results.length > 0 ? (
            <>
              {results.map((result, index) => (
                <SearchResultItem
                  key={result.id}
                  result={result}
                  isSelected={index === selectedIndex}
                  onClick={() => navigateToResult(index)}
                  dataIndex={index}
                />
              ))}
              {totalResults > results.length && (
                <div className="px-4 py-2 text-xs text-text-muted text-center border-t border-surface-border">
                  Showing {results.length} of {totalResults} results
                </div>
              )}
            </>
          ) : query.trim() ? (
            <div className="px-4 py-8 text-center text-text-muted">
              {isLoading ? (
                <span>Searching...</span>
              ) : (
                <span>No results found for "{query}"</span>
              )}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-text-muted">
              <p className="mb-2">Start typing to search messages</p>
              <p className="text-xs">
                Tips: Use <code className="bg-surface-secondary px-1 rounded">from:@user</code> to filter by author,{" "}
                <code className="bg-surface-secondary px-1 rounded">in:#channel</code> for channels
              </p>
            </div>
          )}
        </div>
        
        {/* Footer with keyboard hints */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-surface-border text-xs text-text-muted">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-surface-secondary rounded text-[10px]">↑</kbd>{" "}
              <kbd className="px-1.5 py-0.5 bg-surface-secondary rounded text-[10px]">↓</kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-surface-secondary rounded text-[10px]">Enter</kbd>{" "}
              Open
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-surface-secondary rounded text-[10px]">Esc</kbd>{" "}
              Close
            </span>
          </div>
          <span>
            <kbd className="px-1.5 py-0.5 bg-surface-secondary rounded text-[10px]">Ctrl</kbd>{" "}
            <kbd className="px-1.5 py-0.5 bg-surface-secondary rounded text-[10px]">K</kbd>{" "}
            Toggle search
          </span>
        </div>
      </div>
    </div>
  );
}
