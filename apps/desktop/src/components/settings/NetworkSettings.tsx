import { useState } from "react";
import { useRelayStore } from "../../stores/relay-store";
import { Input, Button } from "../ui";

const DEFAULT_RELAYS = [
  "wss://relay.nodes.services/gun",
  "wss://relay2.nodes.services/gun",
];

/**
 * Network settings section: relay management and connection status.
 */
export function NetworkSettings() {
  const { relays, customRelays, addCustomRelay, removeCustomRelay } = useRelayStore();
  const [newRelayUrl, setNewRelayUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAddRelay = () => {
    setError(null);
    
    // Basic validation
    const url = newRelayUrl.trim();
    if (!url) {
      setError("Please enter a relay URL");
      return;
    }
    
    if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
      setError("URL must start with wss:// or ws://");
      return;
    }

    try {
      addCustomRelay(url);
      setNewRelayUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add relay");
    }
  };

  const handleRemoveRelay = (url: string) => {
    removeCustomRelay(url);
  };

  const formatLatency = (latency: number | null) => {
    if (latency === null) return "—";
    return `${latency}ms`;
  };

  const isDefaultRelay = (url: string) => DEFAULT_RELAYS.includes(url);

  return (
    <div className="space-y-8">
      {/* Header */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-2">Network</h2>
        <p className="text-nodes-text-muted text-sm">
          Manage Gun relay servers for peer-to-peer synchronization.
        </p>
      </section>

      {/* Current Relays */}
      <section>
        <h3 className="text-sm font-medium text-nodes-text mb-3">Connected Relays</h3>
        <div className="space-y-2">
          {relays.length === 0 ? (
            <p className="text-nodes-text-muted text-sm py-4 text-center">
              No relays configured. Add a relay to connect to the network.
            </p>
          ) : (
            relays.map((relay) => (
              <div
                key={relay.url}
                className="flex items-center justify-between p-3 bg-nodes-bg rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      relay.connected ? "bg-nodes-accent" : "bg-red-500"
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-nodes-text truncate">
                      {relay.url}
                    </p>
                    <p className="text-xs text-nodes-text-muted">
                      {relay.connected ? `Latency: ${formatLatency(relay.latency)}` : "Offline"}
                      {isDefaultRelay(relay.url) && " • Default"}
                    </p>
                  </div>
                </div>
                {!isDefaultRelay(relay.url) && (
                  <button
                    onClick={() => handleRemoveRelay(relay.url)}
                    className="p-1.5 text-nodes-text-muted hover:text-red-400 transition-colors shrink-0"
                    title="Remove relay"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* Add Custom Relay */}
      <section>
        <h3 className="text-sm font-medium text-nodes-text mb-3">Add Custom Relay</h3>
        <div className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={newRelayUrl}
              onChange={(value) => {
                setNewRelayUrl(value);
                setError(null);
              }}
              placeholder="wss://your-relay.example.com/gun"
              className="flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleAddRelay()}
            />
            <Button onClick={handleAddRelay}>Add</Button>
          </div>
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <p className="text-xs text-nodes-text-muted">
            Custom relays must expose a Gun WebSocket endpoint. Most relays use the path <code className="bg-nodes-bg px-1 py-0.5 rounded">/gun</code>.
          </p>
        </div>
      </section>

      {/* Info */}
      <section className="pt-4 border-t border-nodes-border">
        <h3 className="text-sm font-medium text-nodes-text mb-2">About Relays</h3>
        <p className="text-xs text-nodes-text-muted leading-relaxed">
          Gun relays are lightweight servers that help peers discover each other and sync data. 
          They don't store your messages or identity — all data is encrypted end-to-end. 
          Multiple relays provide redundancy: if one goes down, your messages still sync through others.
        </p>
      </section>
    </div>
  );
}
