import { useConnectionState } from "../../providers/TransportProvider";

/**
 * ConnectionStatus displays a visual indicator of the transport connection state.
 * Shows connected/disconnected/reconnecting with appropriate colors.
 */
export function ConnectionStatus() {
  const { status, isConnected, peerCount, reconnect, reconnectAttempts } =
    useConnectionState();

  // Determine visual state
  const getStatusColor = () => {
    switch (status) {
      case "connected":
        return "bg-nodes-accent"; // green
      case "connecting":
      case "reconnecting":
        return "bg-yellow-500 animate-pulse";
      case "disconnected":
        return "bg-red-500";
      default:
        return "bg-nodes-text-muted";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "connected":
        return "Online";
      case "connecting":
        return "Connecting...";
      case "reconnecting":
        return `Reconnecting${reconnectAttempts > 1 ? ` (${reconnectAttempts})` : ""}...`;
      case "disconnected":
        return "Offline";
      default:
        return "Unknown";
    }
  };

  return (
    <div className="flex items-center gap-2 text-nodes-text-muted">
      <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
      <span>{getStatusText()}</span>
      {status === "disconnected" && (
        <button
          onClick={reconnect}
          className="text-nodes-accent hover:underline text-xs"
        >
          Retry
        </button>
      )}
    </div>
  );
}

/**
 * Simple inline connection indicator (just the dot and minimal text).
 */
export function ConnectionIndicator() {
  const { status, isConnected } = useConnectionState();

  const color = isConnected
    ? "bg-nodes-accent"
    : status === "disconnected"
    ? "bg-red-500"
    : "bg-yellow-500 animate-pulse";

  return (
    <span
      className={`w-2 h-2 rounded-full ${color}`}
      title={isConnected ? "Connected" : status}
    />
  );
}
