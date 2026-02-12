import { formatDateSeparator } from "../../utils/time";

interface DateSeparatorProps {
  timestamp: number;
}

/**
 * DateSeparator displays a line with the date between messages from different days.
 * Example: "── Today ──" or "── February 11, 2026 ──"
 */
export function DateSeparator({ timestamp }: DateSeparatorProps) {
  return (
    <div className="flex items-center gap-4 my-4 px-4">
      <div className="flex-1 h-px bg-nodes-border" />
      <span className="text-xs text-nodes-text-muted font-medium">
        {formatDateSeparator(timestamp)}
      </span>
      <div className="flex-1 h-px bg-nodes-border" />
    </div>
  );
}
