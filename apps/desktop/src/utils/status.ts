/**
 * Utility functions related to user presence/status.
 */

import type { UserStatus } from "@nodes/core";

/**
 * Get the Tailwind color class for a status.
 */
export function getStatusColor(status: UserStatus | string | undefined): string {
  switch (status) {
    case "online":
      return "bg-nodes-accent";
    case "idle":
      return "bg-yellow-500";
    case "dnd":
      return "bg-red-500";
    case "offline":
    default:
      return "bg-gray-500";
  }
}

/**
 * Get a human-readable label for a status.
 */
export function getStatusLabel(status: UserStatus | string | undefined): string {
  switch (status) {
    case "online":
      return "Online";
    case "idle":
      return "Idle";
    case "dnd":
      return "Do Not Disturb";
    case "offline":
    default:
      return "Offline";
  }
}
