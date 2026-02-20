/**
 * GiphyService handles fetching GIFs from the Giphy API.
 * 
 * API Documentation: https://developers.giphy.com/docs/api/
 * 
 * Note: Free tier requires "Powered by GIPHY" attribution in the UI.
 */

const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY as string | undefined;
const GIPHY_BASE = "https://api.giphy.com/v1/gifs";

export interface GiphyGif {
  id: string;
  title: string;
  previewUrl: string;      // fixed_height_small for picker (smaller file)
  previewWidth: number;
  previewHeight: number;
  fullUrl: string;         // fixed_height for chat display
  fullWidth: number;
  fullHeight: number;
  originalUrl: string;     // original size URL for sharing
}

interface GiphyResponse {
  data: GiphyRawGif[];
  pagination: {
    total_count: number;
    count: number;
    offset: number;
  };
}

interface GiphyRawGif {
  id: string;
  title: string;
  images: {
    fixed_height_small: {
      url: string;
      width: string;
      height: string;
    };
    fixed_height: {
      url: string;
      width: string;
      height: string;
    };
    original: {
      url: string;
      width: string;
      height: string;
    };
  };
}

function mapGif(raw: GiphyRawGif): GiphyGif {
  return {
    id: raw.id,
    title: raw.title,
    previewUrl: raw.images.fixed_height_small.url,
    previewWidth: parseInt(raw.images.fixed_height_small.width, 10),
    previewHeight: parseInt(raw.images.fixed_height_small.height, 10),
    fullUrl: raw.images.fixed_height.url,
    fullWidth: parseInt(raw.images.fixed_height.width, 10),
    fullHeight: parseInt(raw.images.fixed_height.height, 10),
    originalUrl: raw.images.original.url,
  };
}

export class GiphyService {
  /**
   * Check if Giphy is configured (API key present)
   */
  static isConfigured(): boolean {
    return !!GIPHY_API_KEY;
  }

  /**
   * Fetch trending GIFs
   * @param limit Number of GIFs to fetch (default: 20, max: 50)
   * @param offset Pagination offset
   */
  static async trending(limit = 20, offset = 0): Promise<GiphyGif[]> {
    if (!GIPHY_API_KEY) {
      console.warn("[Giphy] No API key configured");
      return [];
    }

    try {
      const res = await fetch(
        `${GIPHY_BASE}/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=pg`
      );
      
      if (!res.ok) {
        throw new Error(`Giphy API error: ${res.status}`);
      }

      const data: GiphyResponse = await res.json();
      return data.data.map(mapGif);
    } catch (err) {
      console.error("[Giphy] Failed to fetch trending:", err);
      throw err;
    }
  }

  /**
   * Search for GIFs
   * @param query Search term
   * @param limit Number of GIFs to fetch (default: 20, max: 50)
   * @param offset Pagination offset
   */
  static async search(query: string, limit = 20, offset = 0): Promise<GiphyGif[]> {
    if (!GIPHY_API_KEY) {
      console.warn("[Giphy] No API key configured");
      return [];
    }

    if (!query.trim()) {
      return this.trending(limit, offset);
    }

    try {
      const res = await fetch(
        `${GIPHY_BASE}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=pg`
      );
      
      if (!res.ok) {
        throw new Error(`Giphy API error: ${res.status}`);
      }

      const data: GiphyResponse = await res.json();
      return data.data.map(mapGif);
    } catch (err) {
      console.error("[Giphy] Failed to search:", err);
      throw err;
    }
  }
}

/**
 * Check if a URL is a Giphy URL
 */
export function isGiphyUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("giphy.com") || 
           parsed.hostname.includes("media.giphy.com") ||
           parsed.hostname.includes("media0.giphy.com") ||
           parsed.hostname.includes("media1.giphy.com") ||
           parsed.hostname.includes("media2.giphy.com") ||
           parsed.hostname.includes("media3.giphy.com") ||
           parsed.hostname.includes("media4.giphy.com");
  } catch {
    return false;
  }
}

/**
 * Extract a clean Giphy URL from various formats
 * Converts any giphy URL to a direct media URL
 */
export function normalizeGiphyUrl(url: string): string {
  // Already a media URL
  if (url.includes("media") && url.includes("giphy.com")) {
    return url;
  }
  
  // Convert giphy.com/gifs/ID to media URL
  const giphyGifMatch = url.match(/giphy\.com\/gifs\/(?:.*-)?([a-zA-Z0-9]+)$/);
  if (giphyGifMatch) {
    return `https://media.giphy.com/media/${giphyGifMatch[1]}/giphy.gif`;
  }
  
  return url;
}
