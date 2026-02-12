import type { TransportMessage } from "@nodes/transport";

interface SystemMessageProps {
  message: TransportMessage;
}

/**
 * SystemMessage displays join/leave events and other system notifications.
 * Centered, muted text with an arrow icon.
 */
export function SystemMessage({ message }: SystemMessageProps) {
  return (
    <div className="flex justify-center py-1 px-4">
      <span className="text-sm text-nodes-text-muted">
        <span className="mr-1">→</span>
        {message.content}
      </span>
    </div>
  );
}
