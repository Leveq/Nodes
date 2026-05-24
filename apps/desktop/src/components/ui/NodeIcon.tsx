import { useState } from "react";
import { useNodeIcon } from "../../hooks/useNodeIcon";

interface NodeIconProps {
  nodeId?: string;
  icon: string;
  name: string;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeClasses = {
  sm: "w-8 h-8 text-sm",
  md: "w-12 h-12 text-lg",
  lg: "w-16 h-16 text-2xl",
  xl: "w-20 h-20 text-4xl",
};

/**
 * Check if a string is an IPFS CID (Qm... or bafy...).
 */
function isIpfsCid(value: string): boolean {
  return value.startsWith("Qm") || value.startsWith("bafy");
}

/**
 * Check if a string contains an emoji (non-ASCII visual character).
 */
function isEmoji(value: string): boolean {
  // Match common emoji patterns: surrogate pairs, variation selectors, ZWJ sequences
  return /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(value);
}

/**
 * Get the first visual character/emoji from a string.
 * Uses Intl.Segmenter if available for proper grapheme cluster handling,
 * falls back to Array.from for basic emoji support.
 */
function getFirstGrapheme(str: string): string {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    const first = segmenter.segment(str)[Symbol.iterator]().next().value;
    return first?.segment ?? str.charAt(0);
  }
  // Fallback: Array.from splits on code points (handles surrogate pairs)
  return Array.from(str)[0] ?? str.charAt(0);
}

/**
 * Shared NodeIcon component for rendering Node icons.
 * Handles IPFS images (via cached fetch pipeline), emojis, and letter fallbacks.
 */
export function NodeIcon({ nodeId, icon, name, size = "md", className = "" }: NodeIconProps) {
  const [imgError, setImgError] = useState(false);
  const isCid = icon ? isIpfsCid(icon) : false;
  const { iconUrl, isLoading } = useNodeIcon(
    isCid ? nodeId : undefined,
    isCid ? icon : undefined
  );

  const sizeClass = sizeClasses[size];

  // IPFS CID → render via cached pipeline
  if (isCid && !imgError) {
    if (isLoading) {
      return (
        <div className={`${sizeClass} rounded-lg overflow-hidden flex items-center justify-center bg-nodes-bg animate-pulse ${className}`} />
      );
    }
    if (iconUrl) {
      return (
        <div className={`${sizeClass} rounded-lg overflow-hidden flex items-center justify-center ${className}`}>
          <img
            src={iconUrl}
            alt={name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      );
    }
  }

  // Emoji or letter fallback
  const displayChar = icon && icon.trim()
    ? isEmoji(icon) ? getFirstGrapheme(icon) : icon.charAt(0).toUpperCase()
    : name.charAt(0).toUpperCase();

  return (
    <span className={`${sizeClass} flex items-center justify-center font-semibold ${className}`}>
      {displayChar}
    </span>
  );
}
