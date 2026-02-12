/**
 * Time formatting utilities for message display.
 */

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Format a timestamp for relative display.
 * - Less than 1 minute: "just now"
 * - Less than 1 hour: "Xm ago"
 * - Less than 24 hours: "Xh ago"
 * - Otherwise: formatted date/time
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;

  return formatMessageTime(timestamp);
}

/**
 * Format timestamp for message headers (first in group).
 * - Today: "Today at 3:45 PM"
 * - Yesterday: "Yesterday at 3:45 PM"
 * - Same year: "Feb 11 at 3:45 PM"
 * - Different year: "Feb 11, 2025 at 3:45 PM"
 */
export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = isSameDay(date, now);
  const isYesterday = isSameDay(date, new Date(now.getTime() - 86400000));

  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  if (isToday) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;

  const sameYear = date.getFullYear() === now.getFullYear();
  const dateStr = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });

  return `${dateStr} at ${time}`;
}

/**
 * Format full timestamp for tooltip display.
 * "February 11, 2026 at 3:45:23 PM"
 */
export function formatFullTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Format date for separators between messages.
 * - Today: "Today"
 * - Yesterday: "Yesterday"
 * - Otherwise: "February 11, 2026"
 */
export function formatDateSeparator(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  if (isSameDay(date, now)) return "Today";
  if (isSameDay(date, new Date(now.getTime() - 86400000))) return "Yesterday";

  return date.toLocaleDateString([], {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Check if a date separator should be shown between two messages.
 */
export function shouldShowDateSeparator(
  current: number,
  previous: number | null
): boolean {
  if (!previous) return true;
  return !isSameDay(new Date(current), new Date(previous));
}
