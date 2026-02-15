import Gun from "gun";
import "gun/sea";

type GunInstance = ReturnType<typeof Gun>;
type GunUser = ReturnType<GunInstance["user"]>;

// Local relay for development (run: node scripts/gun-relay.mjs)
const LOCAL_RELAY = "http://localhost:8765/gun";

// Staging relay - set VITE_GUN_RELAY_URL env var to your deployed relay
const STAGING_RELAY = import.meta.env.VITE_GUN_RELAY_URL as string | undefined;

// Public relays - these change frequently, local relay is most reliable
const PUBLIC_PEERS = [
  "https://gun-manhattan.herokuapp.com/gun",
  "https://gun-us.herokuapp.com/gun",
];

/**
 * Get the list of Gun relay peers based on environment.
 * Priority: VITE_GUN_RELAY_URL > local relay > public peers
 */
function getDefaultPeers(): string[] {
  const peers: string[] = [];
  
  // If staging relay is set, use it as primary
  if (STAGING_RELAY) {
    console.log("[Gun] Using staging relay:", STAGING_RELAY);
    peers.push(STAGING_RELAY);
  }
  
  // In development, also try local relay
  if (import.meta.env.DEV) {
    peers.push(LOCAL_RELAY);
  }
  
  // Always include public peers as fallback
  peers.push(...PUBLIC_PEERS);
  
  return peers;
}

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
   * Uses VITE_GUN_RELAY_URL if set, otherwise local relay in dev,
   * falls back to public peers.
   */
  static init(peers?: string[]): GunInstance {
    if (gunInstance) return gunInstance;

    // Use provided peers, or get defaults based on environment
    const activePeers = peers ?? getDefaultPeers();
    console.log("[Gun] Connecting to peers:", activePeers);

    gunInstance = Gun({
      peers: activePeers,
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
