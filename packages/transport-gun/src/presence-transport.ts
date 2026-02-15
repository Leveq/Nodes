import type {
  IPresenceTransport,
  PresenceInfo,
  PresenceHandler,
  Unsubscribe,
} from "@nodes/transport";
import type { UserStatus } from "@nodes/core";
import { GunInstanceManager } from "./gun-instance";

/**
 * GunPresenceTransport implements IPresenceTransport using GunJS.
 *
 * Presence data is stored in a shared graph:
 *   gun.get("presence").get(publicKey) → { status, lastSeen, typing }
 *
 * Typing indicators are stored per-channel:
 *   gun.get("typing").get(channelId).get(publicKey) → { isTyping, timestamp }
 *
 * Presence has a heartbeat mechanism — users update their lastSeen every 30s.
 * If lastSeen is older than 60s, the user is considered offline regardless of
 * their status field.
 */

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds
const OFFLINE_THRESHOLD = 60_000; // 60 seconds
const TYPING_TIMEOUT = 5_000; // 5 seconds — auto-clear typing

// Module-level singleton state for heartbeat management
// This ensures multiple instances of GunPresenceTransport share the same heartbeat
let sharedHeartbeatTimer: ReturnType<typeof setInterval> | null = null;
let sharedPublicKey: string | null = null;
let sharedStatus: UserStatus = "offline";

export class GunPresenceTransport implements IPresenceTransport {
  /**
   * Set the current user's status.
   * Also starts the heartbeat if not already running.
   */
  async setStatus(status: UserStatus): Promise<void> {
    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pair = (user as any)._.sea;

    if (!pair) {
      throw new Error("Not authenticated. Cannot set presence.");
    }

    sharedPublicKey = pair.pub;
    sharedStatus = status;

    gun.get("presence").get(pair.pub).put({
      status,
      lastSeen: Date.now(),
      publicKey: pair.pub,
    });

    // Start heartbeat
    this.startHeartbeat();
  }

  /**
   * Set typing indicator for a channel.
   */
  async setTyping(channelId: string, isTyping: boolean): Promise<void> {
    const gun = GunInstanceManager.get();
    const user = GunInstanceManager.user();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pair = (user as any)._.sea;

    if (!pair) {
      return;
    }

    gun.get("typing").get(channelId).get(pair.pub).put({
      isTyping,
      timestamp: Date.now(),
    });
  }

  /**
   * Subscribe to presence changes for a list of users.
   * Throttled to prevent rapid-fire callbacks.
   */
  subscribe(publicKeys: string[], handler: PresenceHandler): Unsubscribe {
    const gun = GunInstanceManager.get();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refs: any[] = [];
    
    // Throttle: collect presence updates and flush periodically
    let pendingPresence: PresenceInfo[] = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    
    const flush = () => {
      flushTimer = null;
      const toProcess = pendingPresence;
      pendingPresence = [];
      for (const presence of toProcess) {
        handler(presence);
      }
    };

    for (const key of publicKeys) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ref = gun.get("presence").get(key).on((data: any) => {
        if (!data || !data.publicKey) return;

        // Check if actually online based on heartbeat
        const isStale = Date.now() - (data.lastSeen || 0) > OFFLINE_THRESHOLD;

        const presence: PresenceInfo = {
          publicKey: data.publicKey,
          status: isStale ? "offline" : data.status || "offline",
          lastSeen: data.lastSeen || 0,
        };

        // Queue and schedule flush
        pendingPresence.push(presence);
        if (flushTimer === null) {
          flushTimer = setTimeout(flush, 16);
        }
      });

      refs.push(ref);
    }

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      refs.forEach((ref) => ref.off());
    };
  }

  /**
   * Subscribe to typing indicators in a channel.
   * Throttled to prevent rapid-fire callbacks.
   */
  subscribeTyping(
    channelId: string,
    handler: (publicKey: string, isTyping: boolean) => void
  ): Unsubscribe {
    const gun = GunInstanceManager.get();
    
    // Throttle: collect typing updates and flush periodically
    let pendingTyping: Array<{ publicKey: string; isTyping: boolean }> = [];
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    
    const flush = () => {
      flushTimer = null;
      const toProcess = pendingTyping;
      pendingTyping = [];
      for (const { publicKey, isTyping } of toProcess) {
        handler(publicKey, isTyping);
      }
    };

    const ref = gun
      .get("typing")
      .get(channelId)
      .map()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on((data: any, key: string) => {
        if (!data || typeof data.isTyping !== "boolean") return;

        // Auto-expire typing after TYPING_TIMEOUT
        const isExpired = Date.now() - (data.timestamp || 0) > TYPING_TIMEOUT;

        // Queue and schedule flush
        pendingTyping.push({ publicKey: key, isTyping: data.isTyping && !isExpired });
        if (flushTimer === null) {
          flushTimer = setTimeout(flush, 16);
        }
      });

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      ref.off();
    };
  }

  /**
   * Get current presence for a single user.
   */
  async getPresence(publicKey: string): Promise<PresenceInfo | null> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gun.get("presence").get(publicKey).once((data: any) => {
        if (!data || !data.publicKey) {
          resolve(null);
          return;
        }

        const isStale = Date.now() - (data.lastSeen || 0) > OFFLINE_THRESHOLD;

        resolve({
          publicKey: data.publicKey,
          status: isStale ? "offline" : data.status || "offline",
          lastSeen: data.lastSeen || 0,
        });
      });
    });
  }

  /**
   * Set offline status and stop heartbeat.
   * Call this on logout or app close.
   */
  async goOffline(): Promise<void> {
    if (sharedPublicKey) {
      const gun = GunInstanceManager.get();
      gun.get("presence").get(sharedPublicKey).put({
        status: "offline",
        lastSeen: Date.now(),
        publicKey: sharedPublicKey,
      });
    }
    this.stopHeartbeat();
    sharedPublicKey = null;
    sharedStatus = "offline";
  }

  /**
   * Start heartbeat to keep presence alive.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    sharedHeartbeatTimer = setInterval(() => {
      if (!sharedPublicKey) return;

      const gun = GunInstanceManager.get();
      gun.get("presence").get(sharedPublicKey).put({
        status: sharedStatus,
        lastSeen: Date.now(),
        publicKey: sharedPublicKey,
      });
    }, HEARTBEAT_INTERVAL);
  }

  /**
   * Stop the heartbeat (on logout or app close).
   */
  private stopHeartbeat(): void {
    if (sharedHeartbeatTimer) {
      clearInterval(sharedHeartbeatTimer);
      sharedHeartbeatTimer = null;
    }
  }
}
