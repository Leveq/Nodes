import { useState, useEffect, useRef, useCallback } from "react";
import { GiphyService, type GiphyGif } from "../../services/giphy-service";
import { Search, X, Film } from "lucide-react";

interface GifPickerProps {
  onSelect: (gif: GiphyGif) => void;
  onClose: () => void;
}

/**
 * GifPicker displays a searchable grid of GIFs from Giphy.
 * 
 * Features:
 * - Trending GIFs on initial load
 * - Search with debounce
 * - Masonry-style grid layout
 * - Loading skeleton
 * - "Powered by GIPHY" attribution (required by API terms)
 */
export function GifPicker({ onSelect, onClose }: GifPickerProps) {
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  // Focus search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  // Fetch GIFs (trending or search)
  const fetchGifs = useCallback(async (searchQuery: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const results = searchQuery.trim()
        ? await GiphyService.search(searchQuery, 24)
        : await GiphyService.trending(24);
      setGifs(results);
    } catch (err) {
      console.error("[GifPicker] Fetch failed:", err);
      setError("Couldn't load GIFs");
      setGifs([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load trending on mount
  useEffect(() => {
    fetchGifs("");
  }, [fetchGifs]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      fetchGifs(query);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, fetchGifs]);

  const handleGifClick = (gif: GiphyGif) => {
    onSelect(gif);
    onClose();
  };

  const clearSearch = () => {
    setQuery("");
    searchInputRef.current?.focus();
  };

  return (
    <div
      ref={containerRef}
      className="w-[340px] bg-nodes-surface border border-nodes-border rounded-lg shadow-xl overflow-hidden"
    >
      {/* Search Header */}
      <div className="p-3 border-b border-nodes-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-nodes-text-muted" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search GIFs..."
            className="w-full pl-9 pr-8 py-2 text-sm bg-nodes-bg border border-nodes-border rounded-md text-nodes-text placeholder-nodes-text-muted focus:outline-none focus:border-nodes-primary"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-nodes-text-muted hover:text-nodes-text"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* GIF Grid */}
      <div className="h-[300px] overflow-y-auto p-2">
        {isLoading ? (
          <GifGridSkeleton />
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-nodes-text-muted">
            <Film className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">{error}</p>
            <button
              onClick={() => fetchGifs(query)}
              className="mt-2 text-xs text-nodes-primary hover:underline"
            >
              Try again
            </button>
          </div>
        ) : gifs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-nodes-text-muted">
            <Film className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm">No GIFs found</p>
            {query && (
              <p className="text-xs mt-1">Try a different search term</p>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {gifs.map((gif) => (
              <GifItem key={gif.id} gif={gif} onClick={handleGifClick} />
            ))}
          </div>
        )}
      </div>

      {/* Attribution Footer */}
      <div className="px-3 py-2 border-t border-nodes-border bg-nodes-bg/50">
        <a
          href="https://giphy.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 text-xs text-nodes-text-muted hover:text-nodes-text"
        >
          <span>Powered by</span>
          <img
            src="https://giphy.com/static/img/giphy_logo_square_social.png"
            alt="GIPHY"
            className="h-4"
          />
        </a>
      </div>
    </div>
  );
}

interface GifItemProps {
  gif: GiphyGif;
  onClick: (gif: GiphyGif) => void;
}

function GifItem({ gif, onClick }: GifItemProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <button
      onClick={() => onClick(gif)}
      className="relative overflow-hidden rounded-md bg-nodes-bg hover:ring-2 hover:ring-nodes-primary transition-all cursor-pointer"
      style={{
        // Maintain aspect ratio based on preview dimensions
        aspectRatio: `${gif.previewWidth} / ${gif.previewHeight}`,
      }}
    >
      {!isLoaded && (
        <div className="absolute inset-0 bg-nodes-border/50 animate-pulse" />
      )}
      <img
        src={gif.previewUrl}
        alt={gif.title}
        className={`w-full h-full object-cover transition-opacity ${
          isLoaded ? "opacity-100" : "opacity-0"
        }`}
        onLoad={() => setIsLoaded(true)}
        loading="lazy"
      />
    </button>
  );
}

function GifGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="bg-nodes-border/50 rounded-md animate-pulse"
          style={{
            aspectRatio: "1 / 1",
            animationDelay: `${i * 50}ms`,
          }}
        />
      ))}
    </div>
  );
}

export default GifPicker;
