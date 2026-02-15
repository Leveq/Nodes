/**
 * Link Preview Card - displays metadata for URLs in messages
 */

import { memo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { LinkPreview } from "../../hooks/useLinkPreview";

interface LinkPreviewCardProps {
  preview: LinkPreview;
  onDismiss?: () => void;
}

export const LinkPreviewCard = memo(function LinkPreviewCard({
  preview,
  onDismiss,
}: LinkPreviewCardProps) {
  const [imageError, setImageError] = useState(false);
  const [faviconError, setFaviconError] = useState(false);

  const handleClick = () => {
    invoke("plugin:shell|open", { path: preview.url }).catch(console.error);
  };

  // For YouTube, render a special card
  if (preview.isYouTube && preview.videoId) {
    return (
      <div className="mt-2 max-w-md rounded-lg border border-nodes-border bg-nodes-surface overflow-hidden group">
        {/* Dismiss button */}
        {onDismiss && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-black/50 hover:bg-black/70 text-white"
            title="Dismiss preview"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        
        {/* YouTube thumbnail - clickable */}
        <button
          onClick={handleClick}
          className="relative w-full aspect-video bg-black cursor-pointer hover:opacity-90 transition-opacity"
        >
          <img
            src={preview.image || `https://img.youtube.com/vi/${preview.videoId}/hqdefault.jpg`}
            alt="YouTube video thumbnail"
            className="w-full h-full object-cover"
            onError={() => setImageError(true)}
          />
          {/* Play button overlay */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-16 h-12 bg-red-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-8 h-8 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </button>
        
        {/* YouTube info */}
        <div className="p-3">
          <div className="flex items-center gap-2 text-xs text-nodes-text-muted mb-1">
            <img
              src="https://www.youtube.com/favicon.ico"
              alt="YouTube"
              className="w-4 h-4"
              onError={() => setFaviconError(true)}
            />
            <span>YouTube</span>
          </div>
          {preview.title && (
            <button
              onClick={handleClick}
              className="text-sm font-medium text-nodes-text hover:text-nodes-primary transition-colors text-left line-clamp-2"
            >
              {preview.title}
            </button>
          )}
        </div>
      </div>
    );
  }

  // Regular link preview card
  const hasVisuals = preview.image && !imageError;

  return (
    <div className="relative mt-2 max-w-md rounded-lg border border-nodes-border bg-nodes-surface overflow-hidden group">
      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-black/50 hover:bg-black/70 text-white"
          title="Dismiss preview"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      
      <button
        onClick={handleClick}
        className="w-full text-left hover:bg-nodes-surface-hover transition-colors"
      >
        <div className={`flex ${hasVisuals ? "flex-row" : ""}`}>
          {/* Thumbnail */}
          {hasVisuals && (
            <div className="w-24 h-24 shrink-0 bg-nodes-background">
              <img
                src={preview.image!}
                alt=""
                className="w-full h-full object-cover"
                onError={() => setImageError(true)}
              />
            </div>
          )}
          
          {/* Text content */}
          <div className="flex-1 p-3 min-w-0">
            {/* Site info */}
            <div className="flex items-center gap-2 text-xs text-nodes-text-muted mb-1">
              {preview.favicon && !faviconError && (
                <img
                  src={preview.favicon}
                  alt=""
                  className="w-4 h-4"
                  onError={() => setFaviconError(true)}
                />
              )}
              <span className="truncate">{preview.siteName || extractDomain(preview.url)}</span>
            </div>
            
            {/* Title */}
            {preview.title && (
              <div className="text-sm font-medium text-nodes-text line-clamp-2 mb-1">
                {preview.title}
              </div>
            )}
            
            {/* Description */}
            {preview.description && (
              <div className="text-xs text-nodes-text-muted line-clamp-2">
                {preview.description}
              </div>
            )}
          </div>
        </div>
      </button>
    </div>
  );
});

/**
 * Skeleton loading state for link preview
 */
export const LinkPreviewSkeleton = memo(function LinkPreviewSkeleton() {
  return (
    <div className="mt-2 max-w-md rounded-lg border border-nodes-border bg-nodes-surface overflow-hidden animate-pulse">
      <div className="flex">
        <div className="w-24 h-24 shrink-0 bg-nodes-border/30" />
        <div className="flex-1 p-3 space-y-2">
          <div className="h-3 w-20 bg-nodes-border/30 rounded" />
          <div className="h-4 w-full bg-nodes-border/30 rounded" />
          <div className="h-3 w-3/4 bg-nodes-border/30 rounded" />
        </div>
      </div>
    </div>
  );
});

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
