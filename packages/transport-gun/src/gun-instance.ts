import Gun from "gun";
import "gun/sea";

type GunInstance = ReturnType<typeof Gun>;
type GunUser = ReturnType<GunInstance["user"]>;

// Local relay for development (run: node scripts/gun-relay.mjs)
const LOCAL_RELAY = "http://localhost:8765/gun";

// Fallback public relays (often unreliable)
const PUBLIC_PEERS = [
  "https://peer.wallie.io/gun",
  "https://gunjs.herokuapp.com/gun",
];

/**
 * Suppress Gun's verbose "syncing 1K+ records" warning.
 * This warning is informational and doesn't indicate a problem -
 * Gun fires it when rapid .map().on() callbacks occur, which is normal
 * for batch data loading.
 */
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = args[0];
  if (typeof msg === "string" && msg.includes("syncing 1K+ records")) {
    return; // Suppress this specific warning
  }
  originalWarn.apply(console, args);
};

/**
 * Singleton GunJS instance manager.
 * Centralizes Gun initialization and provides access to the gun instance
 * and SEA module throughout the application.
 */

let gunInstance: GunInstance | null = null;

export class GunInstanceManager {
  /**
   * Initialize GunJS with relay peers.
   * Prefers local relay (run scripts/gun-relay.mjs) for dev,
   * falls back to public peers.
   */
  static init(peers?: string[]): GunInstance {
    if (gunInstance) return gunInstance;

    // Use provided peers, or default to local + public relays
    const defaultPeers = [LOCAL_RELAY, ...PUBLIC_PEERS];

    gunInstance = Gun({
      peers: peers ?? defaultPeers,
      localStorage: true, // Use browser localStorage for persistence
      radisk: true, // Enable Radisk storage engine
    });

    return gunInstance;
  }

  /**
   * Get the current Gun instance.
   */
  static get(): GunInstance {
    if (!gunInstance) {
      throw new Error("Gun not initialized. Call GunInstanceManager.init() first.");
    }
    return gunInstance;
  }

  /**
   * Get the Gun user instance for authenticated operations.
   */
  static user(): GunUser {
    return GunInstanceManager.get().user();
  }

  /**
   * Recall existing session (auto-login from stored session).
   */
  static recall(): Promise<unknown> {
    return new Promise((resolve, reject) => {
      GunInstanceManager.user().recall({ sessionStorage: true }, (ack) => {
        if (ack.err) reject(new Error(ack.err));
        else resolve(ack);
      });
    });
  }

  /**
   * Reset the Gun instance (useful for testing).
   */
  static reset(): void {
    gunInstance = null;
  }
}
