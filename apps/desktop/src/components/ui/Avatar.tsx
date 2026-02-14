import { memo } from "react";
import { useAvatar } from "../../hooks/useAvatar";
import type { UserStatus } from "@nodes/core";

/**
 * Avatar sizes in pixels.
 */
const SIZES = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 64,
  xl: 128,
} as const;

interface AvatarProps {
  /** User's public key for fetching avatar from IPFS */
  publicKey?: string;
  /** Display name for generating fallback letter */
  displayName?: string;
  /** Avatar size variant */
  size?: keyof typeof SIZES;
  /** Show presence indicator dot */
  showPresence?: boolean;
  /** User's presence status */
  presenceStatus?: UserStatus;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Avatar component displays a user's avatar from IPFS or a fallback.
 *
 * - If the user has an avatar, it's fetched from IPFS via AvatarManager
 * - Shows a loading skeleton while fetching
 * - Falls back to a colored circle with the user's first initial
 * - Optionally shows a presence indicator dot
 */
export const Avatar = memo(function Avatar({
  publicKey,
  displayName = "",
  size = "md",
  showPresence = false,
  presenceStatus = "offline",
  className = "",
}: AvatarProps) {
  const { avatarUrl, isLoading } = useAvatar(publicKey, size === "xl" ? "full" : "small");

  const pixelSize = SIZES[size];
  const letter = displayName.charAt(0).toUpperCase() || "?";

  // Generate a consistent color based on the display name
  const bgColor = getAvatarColor(displayName || publicKey || "");

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: pixelSize, height: pixelSize }}
    >
      {/* Loading skeleton */}
      {isLoading && (
        <div
          className="absolute inset-0 rounded-full animate-pulse bg-surface-border"
          style={{ width: pixelSize, height: pixelSize }}
        />
      )}

      {/* Avatar image */}
      {avatarUrl && !isLoading && (
        <img
          src={avatarUrl}
          alt={displayName || "User avatar"}
          className="w-full h-full rounded-full object-cover"
        />
      )}

      {/* Fallback: colored circle with initial */}
      {!avatarUrl && !isLoading && (
        <div
          className="w-full h-full rounded-full flex items-center justify-center font-medium"
          style={{
            backgroundColor: bgColor,
            color: "#ffffff",
            fontSize: pixelSize * 0.45,
          }}
        >
          {letter}
        </div>
      )}

      {/* Presence indicator */}
      {showPresence && (
        <PresenceIndicator
          status={presenceStatus}
          size={size}
        />
      )}
    </div>
  );
});

interface PresenceIndicatorProps {
  status: UserStatus;
  size: keyof typeof SIZES;
}

function PresenceIndicator({ status, size }: PresenceIndicatorProps) {
  // Calculate dot size based on avatar size
  const dotSizes: Record<keyof typeof SIZES, number> = {
    xs: 6,
    sm: 8,
    md: 10,
    lg: 14,
    xl: 16,
  };

  const dotSize = dotSizes[size];

  // Status colors
  const colors: Record<UserStatus, string> = {
    online: "bg-green-500",
    idle: "bg-yellow-500",
    dnd: "bg-red-500",
    offline: "bg-gray-500",
  };

  return (
    <div
      className={`absolute bottom-0 right-0 rounded-full border-2 border-depth-primary ${colors[status]}`}
      style={{
        width: dotSize,
        height: dotSize,
      }}
    />
  );
}

/**
 * Generate a consistent background color from a string.
 * Uses a simple hash to pick from a palette of colors.
 */
function getAvatarColor(seed: string): string {
  const colors = [
    "#6366f1", // Indigo
    "#8b5cf6", // Violet
    "#d946ef", // Fuchsia
    "#ec4899", // Pink
    "#f43f5e", // Rose
    "#ef4444", // Red
    "#f97316", // Orange
    "#eab308", // Yellow
    "#84cc16", // Lime
    "#22c55e", // Green
    "#14b8a6", // Teal
    "#06b6d4", // Cyan
    "#0ea5e9", // Sky
    "#3b82f6", // Blue
  ];

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return colors[Math.abs(hash) % colors.length];
}

// Export the colors function for external use
export { getAvatarColor };
