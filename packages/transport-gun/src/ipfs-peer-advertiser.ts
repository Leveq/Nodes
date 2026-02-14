import { GunInstanceManager } from "./gun-instance";
import { IPFSService } from "./ipfs-service";
import type { Unsubscribe } from "@nodes/transport";

/**
 * IPFSPeerAdvertiser publishes and discovers IPFS peer information
 * through the Gun graph.
 *
 * Flow:
 * 1. On IPFS init, publish our multiaddrs to Gun:
 *    gun.get("ipfs-peers").get(publicKey) → { peerId, multiaddrs, updatedAt }
 *
 * 2. When we need content, look up the uploader's IPFS info:
 *    gun.get("ipfs-peers").get(uploaderPublicKey) → their multiaddrs
 *    Then dial those addrs before attempting download
 *
 * 3. Periodically refresh our advertised addrs (they may change)
 *
 * 4. When members come online in a Node, preemptively connect to
 *    their IPFS nodes so content is available immediately
 */

let advertiserInstance: IPFSPeerAdvertiser | null = null;

export class IPFSPeerAdvertiser {
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private subscriptions: Unsubscribe[] = [];
  private connectedPeers = new Set<string>();
  private myPublicKey: string | null = null;

  /**
   * Get the singleton instance.
   */
  static getInstance(): IPFSPeerAdvertiser {
    if (!advertiserInstance) {
      advertiserInstance = new IPFSPeerAdvertiser();
    }
    return advertiserInstance;
  }

  /**
   * Start advertising our IPFS peer info and discovering others.
   *
   * @param publicKey - Current user's Gun public key
   */
  async start(publicKey: string): Promise<void> {
    this.myPublicKey = publicKey;

    // Publish our peer info immediately (IPFSService.init should have already waited for addrs)
    await this.publishPeerInfo(publicKey);

    // Verify the publish had addresses — retry if not
    const addrs = IPFSService.getMultiaddrs();
    if (addrs.length === 0) {
      console.warn("[IPFS-Peer] Published with 0 addrs — will retry in 5s and 15s");
      setTimeout(() => this.publishPeerInfo(publicKey), 5000);
      setTimeout(() => this.publishPeerInfo(publicKey), 15000);
    }

    // Refresh every 60 seconds (multiaddrs can change)
    this.refreshInterval = setInterval(() => {
      this.publishPeerInfo(publicKey).catch(console.error);
    }, 60000);

    console.log("[IPFS-Peer] Advertiser started for:", publicKey.slice(0, 12) + "...");
  }

  /**
   * Publish this node's IPFS connection info to Gun.
   */
  async publishPeerInfo(publicKey: string): Promise<void> {
    const gun = GunInstanceManager.get();
    
    if (!IPFSService.isReady()) {
      console.warn("[IPFS-Peer] Cannot publish — IPFS not ready");
      return;
    }

    const peerId = IPFSService.getPeerId();
    const multiaddrs = IPFSService.getMultiaddrs();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (gun.get("ipfs-peers").get(publicKey) as any).put({
      peerId,
      multiaddrs: JSON.stringify(multiaddrs),
      updatedAt: Date.now(),
    });

    console.log("[IPFS-Peer] Published peer info:", {
      peerId: peerId.slice(0, 12) + "...",
      addrs: multiaddrs.length,
      multiaddrs: multiaddrs.slice(0, 2), // Log first 2 addrs
    });
  }

  /**
   * Resolve another user's IPFS peer info from Gun.
   * Returns their multiaddrs if available.
   */
  async resolvePeerInfo(
    publicKey: string
  ): Promise<{ peerId: string; multiaddrs: string[] } | null> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve) => {
      let resolved = false;

      gun
        .get("ipfs-peers")
        .get(publicKey)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .once((data: any) => {
          if (resolved) return;
          resolved = true;

          if (!data || !data.peerId) {
            console.log("[IPFS-Peer] No peer info found for:", publicKey.slice(0, 12));
            resolve(null);
            return;
          }

          // Check if the info is stale (older than 5 minutes)
          const age = Date.now() - (data.updatedAt || 0);
          if (age > 5 * 60 * 1000) {
            console.warn("[IPFS-Peer] Peer info is stale:", publicKey.slice(0, 12));
            // Still try it — stale addrs might still work
          }

          let multiaddrs: string[] = [];
          try {
            multiaddrs = JSON.parse(data.multiaddrs || "[]");
          } catch {
            multiaddrs = [];
          }

          console.log("[IPFS-Peer] Resolved peer info:", {
            peerId: data.peerId.slice(0, 12) + "...",
            addrs: multiaddrs.length,
          });

          resolve({
            peerId: data.peerId,
            multiaddrs,
          });
        });

      // Timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.log("[IPFS-Peer] Timeout resolving peer:", publicKey.slice(0, 12));
          resolve(null);
        }
      }, 5000);
    });
  }

  /**
   * Connect to a specific user's IPFS node.
   * Resolves their peer info from Gun and dials them.
   *
   * @param publicKey - The user's Gun public key
   * @returns true if connected, false if failed
   */
  async connectToUser(publicKey: string): Promise<boolean> {
    // Skip self
    if (publicKey === this.myPublicKey) return true;

    // Skip if already connected
    if (this.connectedPeers.has(publicKey)) {
      console.log("[IPFS-Peer] Already connected to:", publicKey.slice(0, 12));
      return true;
    }

    const peerInfo = await this.resolvePeerInfo(publicKey);
    if (!peerInfo || !peerInfo.peerId) {
      console.warn("[IPFS-Peer] No peer info found for:", publicKey.slice(0, 12));
      return false;
    }

    console.log("[IPFS-Peer] Attempting connection to:", {
      user: publicKey.slice(0, 12),
      peerId: peerInfo.peerId.slice(0, 12),
      addrs: peerInfo.multiaddrs.length,
    });

    // Try each multiaddr first
    let connected = false;
    for (const addr of peerInfo.multiaddrs) {
      try {
        await IPFSService.connectToPeer(addr);
        connected = true;
        this.connectedPeers.add(publicKey);
        console.log("[IPFS-Peer] Connected via multiaddr:", publicKey.slice(0, 12));
        break;
      } catch {
        continue;
      }
    }

    // Try direct PeerId connection (may work via DHT)
    if (!connected) {
      try {
        await IPFSService.connectToPeerId(peerInfo.peerId);
        connected = true;
        this.connectedPeers.add(publicKey);
        console.log("[IPFS-Peer] Connected via PeerId:", publicKey.slice(0, 12));
      } catch {
        // Try next method
      }
    }

    // Try circuit relay as last resort
    if (!connected && IPFSService.getRelayAddr()) {
      try {
        await IPFSService.connectViaRelay(peerInfo.peerId);
        connected = true;
        this.connectedPeers.add(publicKey);
        console.log("[IPFS-Peer] Connected via circuit relay:", publicKey.slice(0, 12));
      } catch {
        console.warn("[IPFS-Peer] All connection attempts failed:", publicKey.slice(0, 12));
      }
    }

    return connected;
  }

  /**
   * Preemptively connect to all online members of a Node.
   * Call this when switching Nodes or when presence changes detect
   * new online members.
   *
   * @param memberPublicKeys - Array of member public keys
   */
  async connectToNodeMembers(memberPublicKeys: string[]): Promise<void> {
    const others = memberPublicKeys.filter((k) => k !== this.myPublicKey);

    if (others.length === 0) return;

    console.log(`[IPFS-Peer] Connecting to ${others.length} Node members...`);

    // Connect in parallel, don't wait for all
    const results = await Promise.allSettled(
      others.map((key) => this.connectToUser(key))
    );

    const connected = results.filter(
      (r) => r.status === "fulfilled" && r.value
    ).length;
    console.log(`[IPFS-Peer] Connected to ${connected}/${others.length} members.`);
  }

  /**
   * Subscribe to IPFS peer info changes for a set of users.
   * When a user publishes new peer info (comes online, addr changes),
   * automatically connect to them.
   */
  subscribeToMembers(memberPublicKeys: string[]): void {
    const gun = GunInstanceManager.get();

    for (const key of memberPublicKeys) {
      if (key === this.myPublicKey) continue;

      const ref = gun
        .get("ipfs-peers")
        .get(key)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on((data: any) => {
          if (!data || !data.peerId) return;

          // New peer info — connect
          this.connectToUser(key).catch(() => {
            // Ignore connection failures in subscription
          });
        });

      this.subscriptions.push(() => ref.off());
    }
  }

  /**
   * Clear connection tracking for a user (when they go offline).
   */
  clearPeerConnection(publicKey: string): void {
    this.connectedPeers.delete(publicKey);
  }

  /**
   * Get count of connected IPFS peers.
   */
  getConnectedCount(): number {
    return this.connectedPeers.size;
  }

  /**
   * Stop the advertiser and clean up.
   */
  stop(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    for (const unsub of this.subscriptions) {
      unsub();
    }
    this.subscriptions = [];
    this.connectedPeers.clear();
    this.myPublicKey = null;

    console.log("[IPFS-Peer] Advertiser stopped.");
  }
}

/**
 * Get the singleton IPFSPeerAdvertiser instance.
 */
export function getIPFSPeerAdvertiser(): IPFSPeerAdvertiser {
  return IPFSPeerAdvertiser.getInstance();
}
