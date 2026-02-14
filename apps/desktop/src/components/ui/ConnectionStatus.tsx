import { useConnectionState } from "../../providers/TransportProvider";

/**
 * Small spinning loader for connection states
 */
function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin h-3 w-3 ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

/**
 * ConnectionStatus displays a visual indicator of the transport connection state.
 * Shows connected/disconnected/reconnecting with appropriate colors.
 */
export function ConnectionStatus() {
  const { status, reconnect, reconnectAttempts } =
    useConnectionState();

  // Determine visual state
  const getStatusColor = () => {
    switch (status) {
      case "connected":
        return "bg-nodes-accent"; // green
      case "connecting":
      case "reconnecting":
        return "bg-yellow-500";
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
        return "Connecting";
      case "reconnecting":
        return `Reconnecting${reconnectAttempts > 1 ? ` (${reconnectAttempts})` : ""}`;
      case "disconnected":
        return "Offline";
      default:
        return "Unknown";
    }
  };

  const isLoading = status === "connecting" || status === "reconnecting";

  return (
    <div className="flex items-center gap-2 text-nodes-text-muted">
      {isLoading ? (
        <Spinner className="text-yellow-500" />
      ) : (
        <span className={`w-2 h-2 rounded-full ${getStatusColor()}`} />
      )}
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

  const isLoading = status === "connecting" || status === "reconnecting";

  if (isLoading) {
    return <Spinner className="text-yellow-500" />;
  }

  const color = isConnected
    ? "bg-nodes-accent"
    : status === "disconnected"
    ? "bg-red-500"
    : "bg-yellow-500";

  return (
    <span
      className={`w-2 h-2 rounded-full ${color}`}
      title={isConnected ? "Connected" : status}
    />
  );
}
