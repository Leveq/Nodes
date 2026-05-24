import { useState, useRef, useEffect } from "react";
import { useRelayStore } from "../../stores/relay-store";

/**
 * RelayStatusIndicator shows the health status of connected Gun relays.
 * - Green: All relays connected
 * - Yellow: Some relays connected (degraded)
 * - Red: No relays connected
 * Clicking shows a popover with individual relay details.
 */
export function RelayStatusIndicator() {
  const { relays, connectedCount, totalCount } = useRelayStore();
  const [showPopover, setShowPopover] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowPopover(false);
      }
    }

    if (showPopover) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showPopover]);

  // Don't render if not monitoring
  if (totalCount === 0) return null;

  const getStatusColor = () => {
    if (connectedCount === 0) return "bg-red-500";
    if (connectedCount < totalCount) return "bg-yellow-500";
    return "bg-nodes-accent";
  };

  const getStatusText = () => {
    if (connectedCount === 0) return "Disconnected";
    if (connectedCount < totalCount) return "Degraded";
    return "Connected";
  };

  const formatLatency = (latency: number | null) => {
    if (latency === null) return "—";
    return `${latency}ms`;
  };

  const formatRelayName = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.hostname;
    } catch {
      return url;
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setShowPopover(!showPopover)}
        className="flex items-center gap-1.5 text-nodes-text-muted hover:text-nodes-text transition-colors px-1.5 py-0.5 rounded hover:bg-nodes-bg/50"
        title={`Relay Status: ${getStatusText()} (${connectedCount}/${totalCount})`}
      >
        <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
        <span className="text-xs">
          {connectedCount}/{totalCount}
        </span>
      </button>

      {showPopover && (
        <div
          ref={popoverRef}
          className="absolute bottom-full left-0 mb-2 w-64 bg-nodes-surface border border-nodes-border rounded-lg shadow-lg z-50"
        >
          <div className="px-3 py-2 border-b border-nodes-border">
            <h3 className="text-sm font-medium text-nodes-text">Relay Status</h3>
            <p className="text-xs text-nodes-text-muted mt-0.5">
              {getStatusText()} ({connectedCount}/{totalCount} relays)
            </p>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {relays.map((relay) => (
              <div
                key={relay.url}
                className="px-3 py-2 flex items-center justify-between border-b border-nodes-border/50 last:border-b-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${
                      relay.connected ? "bg-nodes-accent" : "bg-red-500"
                    }`}
                  />
                  <span className="text-xs text-nodes-text truncate">
                    {formatRelayName(relay.url)}
                  </span>
                </div>
                <span
                  className={`text-xs shrink-0 ml-2 ${
                    relay.connected ? "text-nodes-text-muted" : "text-red-400"
                  }`}
                >
                  {relay.connected ? formatLatency(relay.latency) : "offline"}
                </span>
              </div>
            ))}
          </div>
          {relays.length > 0 && (
            <div className="px-3 py-1.5 border-t border-nodes-border text-xs text-nodes-text-muted">
              Last checked: {relays[0]?.lastChecked ? new Date(relays[0].lastChecked).toLocaleTimeString() : "—"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
