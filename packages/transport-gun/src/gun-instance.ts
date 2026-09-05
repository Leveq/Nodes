import Gun from "gun";
import "gun/sea";
import { ackErrorMessage } from "./gun-write";

type GunInstance = ReturnType<typeof Gun>;
type GunUser = ReturnType<GunInstance["user"]>;

const PRODUCTION_RELAYS = [
  'wss://relay.nodes.services/gun',
  'wss://relay2.nodes.services/gun',
];

const STAGING_RELAYS = [
  import.meta.env.VITE_GUN_RELAY_URL as string,
].filter(Boolean);

const LOCAL_RELAY = 'http://localhost:8765/gun';

function getDefaultPeers(): string[] {
  if (STAGING_RELAYS.length > 0) {
    // Production/staging: use configured relays + backup
    const peers = [...STAGING_RELAYS];
    // Add production backup relays if primary is a production relay
    if (STAGING_RELAYS[0]?.includes('nodes.services')) {
      for (const relay of PRODUCTION_RELAYS) {
        if (!peers.includes(relay)) peers.push(relay);
      }
    }
    return peers;
  }
  
  if (import.meta.env.DEV) {
    return [LOCAL_RELAY];
  }
  
  return PRODUCTION_RELAYS;
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
let activePeers: string[] = [];

export class GunInstanceManager {
  /**
   * Initialize GunJS with relay peers.
   * Uses VITE_GUN_RELAY_URL if set, otherwise local relay in dev,
   * falls back to public peers.
   */
  static init(peers?: string[]): GunInstance {
    if (gunInstance) return gunInstance;

    // Use provided peers, or get defaults based on environment
    activePeers = peers ?? getDefaultPeers();
    console.log("[Gun] Connecting to peers:", activePeers);

    gunInstance = Gun({
      peers: activePeers,
      localStorage: true, // Use browser localStorage for persistence
      radisk: true, // Enable Radisk storage engine
      // @ts-expect-error - 'super' is a valid Gun option not reflected in types
      super: false, // Prevent auto-connecting to Gun's public superpeer network
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
        if (ack.err) reject(new Error(ackErrorMessage(ack.err)));
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

  /**
   * Get the peer URLs that Gun is connected to.
   */
  static getPeers(): string[] {
    return activePeers;
  }
}
