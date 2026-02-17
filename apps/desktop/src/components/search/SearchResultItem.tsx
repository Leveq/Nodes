import type { SearchResult } from "@nodes/core";
import { useDisplayName } from "../../hooks/useDisplayName";
import { formatRelativeTime } from "../../utils/time";

interface SearchResultItemProps {
  result: SearchResult;
  isSelected: boolean;
  onClick: () => void;
  dataIndex: number;
}

/**
 * Individual search result item component
 * Displays message snippet with author, time, and location context
 */
export function SearchResultItem({
  result,
  isSelected,
  onClick,
  dataIndex,
}: SearchResultItemProps) {
  const { displayName: authorName } = useDisplayName(result.authorKey);
  
  return (
    <div
      data-index={dataIndex}
      onClick={onClick}
      className={`px-4 py-3 cursor-pointer transition-colors border-b border-surface-border/50 last:border-b-0 ${
        isSelected
          ? "bg-accent/10 border-l-2 border-l-accent"
          : "hover:bg-surface-hover"
      }`}
    >
      {/* Header: Author and time */}
      <div className="flex items-center gap-2 mb-1">
        {/* Avatar placeholder */}
        <div className="w-6 h-6 rounded-full bg-surface-secondary flex items-center justify-center text-xs text-text-muted">
          {(authorName || result.authorKey).charAt(0).toUpperCase()}
        </div>
        
        {/* Author name */}
        <span className="font-medium text-sm text-text-primary">
          {authorName || result.authorKey.slice(0, 8) + "..."}
        </span>
        
        {/* Result type badge */}
        <span
          className={`px-1.5 py-0.5 text-[10px] uppercase rounded ${
            result.type === "dm"
              ? "bg-purple-500/20 text-purple-400"
              : "bg-blue-500/20 text-blue-400"
          }`}
        >
          {result.type === "dm" ? "DM" : "Message"}
        </span>
        
        {/* Location context */}
        {result.type === "message" && (
          <span className="text-xs text-text-muted">
            {result.channelName ? `#${result.channelName}` : result.channelId?.slice(0, 8)}
          </span>
        )}
        
        {/* Timestamp */}
        <span className="text-xs text-text-muted ml-auto">
          {formatRelativeTime(result.timestamp)}
        </span>
      </div>
      
      {/* Content snippet with highlights */}
      <div className="text-sm text-text-secondary pl-8">
        <HighlightedSnippet
          content={result.contentSnippet}
          matches={result.matches}
        />
      </div>
    </div>
  );
}

/**
 * Highlight matched terms in the content snippet
 */
function HighlightedSnippet({
  content,
  matches,
}: {
  content: string;
  matches: string[];
}) {
  if (!matches.length) {
    return <span>{content}</span>;
  }
  
  // Create a case-insensitive pattern to match all terms
  const pattern = new RegExp(
    `(${matches.map((m) => escapeRegExp(m)).join("|")})`,
    "gi"
  );
  
  const parts = content.split(pattern);
  
  return (
    <>
      {parts.map((part, i) => {
        const isMatch = matches.some(
          (m) => m.toLowerCase() === part.toLowerCase()
        );
        return isMatch ? (
          <mark
            key={i}
            className="bg-yellow-500/30 text-text-primary rounded px-0.5"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

/** Escape special regex characters */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
