/**
 * Hook for fetching and caching link previews using Tauri HTTP plugin
 */

import { useState, useEffect } from "react";
import { fetch } from "@tauri-apps/plugin-http";
import { isYouTubeUrl, getYouTubeVideoId } from "../utils/url-detection";

export interface LinkPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
  favicon: string | null;
  // YouTube-specific
  isYouTube?: boolean;
  videoId?: string;
}

// LRU-style cache for link previews
const previewCache = new Map<string, LinkPreview | null>();
const MAX_CACHE_SIZE = 500;

// Track in-flight requests to avoid duplicate fetches
const pendingRequests = new Map<string, Promise<LinkPreview | null>>();

/**
 * Parse OpenGraph and meta tags from HTML
 */
function parseMetadata(html: string, url: string): LinkPreview {
  // Helper to extract meta content
  const getMetaContent = (property: string): string | null => {
    // Try property attribute (OpenGraph)
    const propMatch = html.match(
      new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, "i")
    );
    if (propMatch) return propMatch[1];
    
    // Try name attribute (Twitter, fallback)
    const nameMatch = html.match(
      new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, "i")
    );
    if (nameMatch) return nameMatch[1];
    
    // Try reverse order (content before property/name)
    const reverseMatch = html.match(
      new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(property|name)=["']${property}["']`, "i")
    );
    if (reverseMatch) return reverseMatch[1];
    
    return null;
  };

  // Extract title from <title> tag as fallback
  const titleTagMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  
  // Extract favicon
  const faviconMatch = html.match(
    /<link[^>]*rel=["'](icon|shortcut icon)["'][^>]*href=["']([^"']*)["']/i
  ) || html.match(
    /<link[^>]*href=["']([^"']*)["'][^>]*rel=["'](icon|shortcut icon)["']/i
  );
  
  let favicon: string | null = null;
  if (faviconMatch) {
    const faviconHref = faviconMatch[2] || faviconMatch[1];
    favicon = resolveUrl(faviconHref, url);
  } else {
    // Default to /favicon.ico
    try {
      const urlObj = new URL(url);
      favicon = `${urlObj.origin}/favicon.ico`;
    } catch {
      // Ignore
    }
  }

  // Get image URL and resolve relative paths
  let image = getMetaContent("og:image") || getMetaContent("twitter:image");
  if (image) {
    image = resolveUrl(image, url);
  }

  return {
    url,
    title: getMetaContent("og:title") || getMetaContent("twitter:title") || titleTagMatch?.[1]?.trim() || null,
    description: getMetaContent("og:description") || getMetaContent("twitter:description") || getMetaContent("description") || null,
    image,
    siteName: getMetaContent("og:site_name") || extractDomain(url),
    favicon,
  };
}

/**
 * Resolve relative URLs to absolute
 */
function resolveUrl(relativeUrl: string, baseUrl: string): string {
  if (relativeUrl.startsWith("http://") || relativeUrl.startsWith("https://")) {
    return relativeUrl;
  }
  
  try {
    const base = new URL(baseUrl);
    if (relativeUrl.startsWith("//")) {
      return `${base.protocol}${relativeUrl}`;
    }
    if (relativeUrl.startsWith("/")) {
      return `${base.origin}${relativeUrl}`;
    }
    // Relative path
    const basePath = base.pathname.split("/").slice(0, -1).join("/");
    return `${base.origin}${basePath}/${relativeUrl}`;
  } catch {
    return relativeUrl;
  }
}

/**
 * Extract domain from URL for fallback site name
 */
function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * Fetch link preview metadata from URL
 */
async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  // Handle YouTube specially
  if (isYouTubeUrl(url)) {
    const videoId = getYouTubeVideoId(url);
    if (videoId) {
      return {
        url,
        title: null, // Will be populated by oEmbed if available, or we can use generic
        description: null,
        image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
        siteName: "YouTube",
        favicon: "https://www.youtube.com/favicon.ico",
        isYouTube: true,
        videoId,
      };
    }
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Nodes/0.2.0 LinkPreview (Desktop App)",
        "Accept": "text/html,application/xhtml+xml",
      },
      connectTimeout: 5000,
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      // Not HTML, can't parse metadata
      return null;
    }

    const html = await response.text();
    return parseMetadata(html, url);
  } catch (error) {
    console.warn("Failed to fetch link preview:", error);
    return null;
  }
}

/**
 * Hook to manage link preview fetching with caching and debouncing
 */
export function useLinkPreview(url: string | undefined) {
  const [preview, setPreview] = useState<LinkPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!url) {
      setPreview(null);
      setLoading(false);
      return;
    }

    // Check cache first
    if (previewCache.has(url)) {
      setPreview(previewCache.get(url) || null);
      setLoading(false);
      return;
    }

    // Check if request is already in flight
    if (pendingRequests.has(url)) {
      setLoading(true);
      pendingRequests.get(url)!.then((result) => {
        setPreview(result);
        setLoading(false);
      });
      return;
    }

    // Debounce: don't fetch immediately (message might still be syncing)
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const fetchPromise = fetchLinkPreview(url);
        pendingRequests.set(url, fetchPromise);
        
        const result = await fetchPromise;
        
        // LRU eviction
        if (previewCache.size >= MAX_CACHE_SIZE) {
          const firstKey = previewCache.keys().next().value;
          if (firstKey) previewCache.delete(firstKey);
        }
        
        previewCache.set(url, result);
        pendingRequests.delete(url);
        
        setPreview(result);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch preview");
        pendingRequests.delete(url);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
    };
  }, [url]);

  return { preview, loading, error };
}

/**
 * Manually invalidate a cached preview
 */
export function invalidatePreviewCache(url: string) {
  previewCache.delete(url);
}

/**
 * Clear the entire preview cache
 */
export function clearPreviewCache() {
  previewCache.clear();
}
