/**
 * URL detection utilities for link previews
 */

// Match common URLs but stop at common delimiters
const URL_REGEX = /https?:\/\/[^\s<>)"'\]]+/gi;

// Image extensions that should render inline (not as link preview cards)
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"];

/**
 * Extract all URLs from a text string
 */
export function extractUrls(content: string): string[] {
  const matches = content.match(URL_REGEX) || [];
  // Deduplicate and clean up trailing punctuation
  return [...new Set(matches.map(cleanUrl))];
}

/**
 * Clean trailing punctuation from URLs
 */
function cleanUrl(url: string): string {
  // Remove trailing punctuation that's likely not part of the URL
  return url.replace(/[.,;:!?)\]]+$/, "");
}

/**
 * Check if a URL points to an image file
 */
export function isImageUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return IMAGE_EXTENSIONS.some((ext) => pathname.endsWith(ext));
  } catch {
    return false;
  }
}

/**
 * Check if a URL is a YouTube video
 */
export function isYouTubeUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    return (
      urlObj.hostname === "youtube.com" ||
      urlObj.hostname === "www.youtube.com" ||
      urlObj.hostname === "youtu.be" ||
      urlObj.hostname === "m.youtube.com"
    );
  } catch {
    return false;
  }
}

/**
 * Extract YouTube video ID from a URL
 */
export function getYouTubeVideoId(url: string): string | null {
  try {
    const urlObj = new URL(url);
    
    // Handle youtu.be/VIDEO_ID format
    if (urlObj.hostname === "youtu.be") {
      return urlObj.pathname.slice(1).split("?")[0];
    }
    
    // Handle youtube.com/watch?v=VIDEO_ID format
    if (urlObj.hostname.includes("youtube.com")) {
      // Check for /shorts/VIDEO_ID format
      if (urlObj.pathname.startsWith("/shorts/")) {
        return urlObj.pathname.slice(8).split("?")[0];
      }
      // Check for /embed/VIDEO_ID format
      if (urlObj.pathname.startsWith("/embed/")) {
        return urlObj.pathname.slice(7).split("?")[0];
      }
      // Standard watch?v= format
      return urlObj.searchParams.get("v");
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Get the first previewable URL from content (excludes image URLs)
 */
export function getFirstPreviewableUrl(content: string): string | null {
  const urls = extractUrls(content);
  for (const url of urls) {
    if (!isImageUrl(url)) {
      return url;
    }
  }
  return null;
}
