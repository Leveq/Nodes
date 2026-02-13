import type {
  IConnectionMonitor,
  ConnectionState,
  ConnectionStateHandler,
  Unsubscribe,
} from "@nodes/transport";
import { GunInstanceManager } from "./gun-instance";

/**
 * GunConnectionMonitor tracks the health of the connection to Gun peers.
 *
 * Gun doesn't expose a direct "connected" boolean — we infer connectivity by:
 * 1. Watching the internal `gun._.opt.peers` structure for peer connections
 * 2. Pinging a known shared node and waiting for ACK
 *
 * For MVP, we use a simple timeout-based check:
 * - Write a timestamp to a known "ping" path
 * - If we receive our own write back within 2s, we're connected
 * - Otherwise, assume disconnected
 */

const PING_INTERVAL = 15_000; // 15 seconds
const PING_TIMEOUT = 5_000; // 5 seconds to consider offline
const RECONNECT_DELAY = 3_000; // 3 seconds between reconnect attempts

export class GunConnectionMonitor implements IConnectionMonitor {
  private state: ConnectionState = {
    connected: false,
    status: "connecting",
    peerCount: 0,
    lastConnected: null,
    reconnectAttempts: 0,
  };

  private handlers: Set<ConnectionStateHandler> = new Set();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pingId: string = "";
  private started = false;

  /**
   * Start monitoring connection state.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    // Generate unique ping ID for this session
    this.pingId = `ping_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    // Do initial ping
    this.checkConnection();

    // Start periodic ping
    this.pingTimer = setInterval(() => {
      this.checkConnection();
    }, PING_INTERVAL);
  }

  /**
   * Stop monitoring.
   */
  stop(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.started = false;
  }

  /**
   * Get current connection state.
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Subscribe to state changes.
   */
  onStateChange(handler: ConnectionStateHandler): Unsubscribe {
    this.handlers.add(handler);
    // Immediately call with current state
    handler({ ...this.state });

    return () => {
      this.handlers.delete(handler);
    };
  }

  /**
   * Get count of connected peers (best effort).
   */
  getPeerCount(): number {
    try {
      const gun = GunInstanceManager.get();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const peers = (gun as any)._.opt?.peers || {};
      return Object.keys(peers).length;
    } catch {
      return 0;
    }
  }

  /**
   * Attempt to reconnect.
   */
  async reconnect(): Promise<void> {
    if (this.state.status === "reconnecting") return;

    this.updateState({
      status: "reconnecting",
      reconnectAttempts: this.state.reconnectAttempts + 1,
    });

    // Gun auto-reconnects to peers, but we can help by re-initializing
    // For now, just wait and re-check
    await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY));
    this.checkConnection();
  }

  /**
   * Check connection by doing a ping round-trip.
   */
  private checkConnection(): void {
    // Gracefully handle Gun not being initialized yet
    let gun;
    try {
      gun = GunInstanceManager.get();
    } catch {
      // Gun not initialized yet — keep status as "connecting", will retry on next ping
      if (this.state.status !== "connecting") {
        this.updateState({
          connected: false,
          status: "connecting",
          peerCount: 0,
        });
      }
      return;
    }

    const timestamp = Date.now();
    let resolved = false;
    
    // If this is the first check (status is "connecting"), stay in that state
    // rather than jumping to "disconnected" on timeout
    const isInitialCheck = this.state.status === "connecting";

    // Listen for our own write
    const timeout = setTimeout(() => {
      if (resolved) return;
      resolved = true;

      // Timeout — likely disconnected (but show "connecting" for initial attempt)
      if (isInitialCheck && this.state.reconnectAttempts === 0) {
        // Stay in "connecting" state for first attempt, just retry
        return;
      }
      
      this.updateState({
        connected: false,
        status: "disconnected",
        peerCount: this.getPeerCount(),
      });
    }, PING_TIMEOUT);

    // Write ping and wait for acknowledgment
    gun
      .get("_pings")
      .get(this.pingId)
      .put({ t: timestamp }, () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);

        this.updateState({
          connected: true,
          status: "connected",
          peerCount: this.getPeerCount(),
          lastConnected: Date.now(),
          reconnectAttempts: 0,
        });
      });
  }

  /**
   * Update state and notify handlers.
   */
  private updateState(partial: Partial<ConnectionState>): void {
    const prev = this.state;
    this.state = { ...this.state, ...partial };

    // Only notify if something actually changed
    if (
      prev.connected !== this.state.connected ||
      prev.status !== this.state.status ||
      prev.peerCount !== this.state.peerCount
    ) {
      const snapshot = { ...this.state };
      this.handlers.forEach((h) => h(snapshot));
    }
  }
}
