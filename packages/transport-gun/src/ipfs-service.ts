import { createHelia } from "helia";
import { unixfs } from "@helia/unixfs";
import { CID } from "multiformats/cid";
import { noise } from "@chainsafe/libp2p-noise";
import { yamux } from "@chainsafe/libp2p-yamux";
import { webSockets } from "@libp2p/websockets";
import { webRTC } from "@libp2p/webrtc";
import { circuitRelayTransport } from "@libp2p/circuit-relay-v2";
import { identify } from "@libp2p/identify";
import { bootstrap } from "@libp2p/bootstrap";
import { bitswap } from "@helia/block-brokers";
import { multiaddr } from "@multiformats/multiaddr";
import { peerIdFromString } from "@libp2p/peer-id";
import { createLibp2p } from "libp2p";
import { IDBBlockstore } from "blockstore-idb";
import { IDBDatastore } from "datastore-idb";
import type { Helia } from "helia";
import type { UnixFS } from "@helia/unixfs";

/**
 * IPFSService manages the embedded Helia IPFS node.
 *
 * Singleton pattern — one Helia node per app instance.
 * The node starts when first needed and persists for the session.
 *
 * Networking:
 * - WebSockets for relay/bootstrap connections
 * - WebRTC for direct browser-to-browser connections
 * - Circuit relay for NAT traversal fallback
 * - Bootstrap peers for DHT discovery
 */

let heliaInstance: Helia | null = null;
let fsInstance: UnixFS | null = null;
let initPromise: Promise<void> | null = null;
let relayMultiaddr: string | null = null;
let relayPeerId: string | null = null;

// In-flight download cache - prevents duplicate concurrent requests for same CID
const inflightDownloads = new Map<string, Promise<Uint8Array>>();

// ============================================
// Download Cache (IndexedDB)
// ============================================
const CACHE_DB_NAME = "ipfs-download-cache";
const CACHE_STORE_NAME = "files";
const CACHE_VERSION = 1;

let cacheDb: IDBDatabase | null = null;

async function openCacheDb(): Promise<IDBDatabase> {
  if (cacheDb) return cacheDb;
  
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      cacheDb = request.result;
      resolve(cacheDb);
    };
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME);
      }
    };
  });
}

async function getCachedDownload(cid: string): Promise<Uint8Array | null> {
  try {
    const db = await openCacheDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, "readonly");
      const store = tx.objectStore(CACHE_STORE_NAME);
      const request = store.get(cid);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  } catch (err) {
    console.warn("[IPFS Cache] Failed to read cache:", err);
    return null;
  }
}

async function setCachedDownload(cid: string, data: Uint8Array): Promise<void> {
  try {
    const db = await openCacheDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CACHE_STORE_NAME, "readwrite");
      const store = tx.objectStore(CACHE_STORE_NAME);
      const request = store.put(data, cid);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.warn("[IPFS Cache] Failed to write cache:", err);
  }
}

export class IPFSService {
  /**
   * Initialize the Helia IPFS node with proper P2P networking.
   * Call once at app startup (after auth).
   * Safe to call multiple times — will return existing node.
   */
  static async init(): Promise<void> {
    // If already initialized, return immediately
    if (heliaInstance) return;

    // If initialization is in progress, wait for it
    if (initPromise) return initPromise;

    // Start initialization
    initPromise = (async () => {
      try {
        // Create libp2p instance with custom configuration
        const libp2p = await createLibp2p({
          // Listen addresses for relay reservation + WebRTC signaling
          addresses: {
            listen: [
              '/p2p-circuit',  // Get relay reservation
              '/webrtc',       // Listen for WebRTC connections via relay signaling
            ]
          },

          // Transports: how nodes connect to each other
          transports: [
            // WebSockets — connects to relay servers and other WS-capable peers
            webSockets(),

            // WebRTC — direct browser-to-browser connections (NAT traversal)
            webRTC(),

            // Circuit relay — fallback when direct connections fail
            // Routes traffic through a relay peer
            circuitRelayTransport(),
          ],

          // Connection encryption
          connectionEncrypters: [noise()],

          // Stream multiplexing
          streamMuxers: [yamux()],

          // Peer discovery
          peerDiscovery: [
            // Bootstrap with public IPFS nodes for DHT access
            bootstrap({
              list: [
                // Public IPFS bootstrap nodes (WebSocket endpoints)
                "/dnsaddr/bootstrap.libp2p.io/p2p/QmNnooDu7bfjPFoTZYxMNLWUQJyrVwtbZg5gBMjTezGAJN",
                "/dnsaddr/bootstrap.libp2p.io/p2p/QmQCU2EcMqAqQPR2i9bChDtGNJchTbq5TbXJJ16u19uLTa",
                "/dnsaddr/bootstrap.libp2p.io/p2p/QmbLHAnMoJPWSCR5Zhtx6BHJX9KiKNN6tpvbUcqanj75Nb",
              ],
            }),
          ],

          // Services
          services: {
            identify: identify(),
          },

          // Connection manager settings
          connectionManager: {
            maxConnections: 50,
          },

          // Connection gater - allow localhost ws:// for development relay
          // The browser default blocks all ws:// and private addresses
          connectionGater: {
            denyDialMultiaddr: async () => {
              // Allow ALL connections (override browser defaults)
              // This is needed because browser defaults block:
              // 1. All ws:// connections (insecure websockets)
              // 2. All private addresses (127.0.0.1, localhost, etc.)
              return false; // don't deny any address
            },
          },
        });

        // Create persistent stores using IndexedDB
        // This ensures uploaded content survives app restart
        const blockstore = new IDBBlockstore('helia-blocks');
        const datastore = new IDBDatastore('helia-data');
        await blockstore.open();
        await datastore.open();

        // Create Helia with pre-configured libp2p and persistent storage
        heliaInstance = await createHelia({
          libp2p,
          blockstore,
          datastore,
          blockBrokers: [bitswap()],
        });

        fsInstance = unixfs(heliaInstance);

        const peerId = heliaInstance.libp2p.peerId.toString();
        const addrs = heliaInstance.libp2p.getMultiaddrs().map((a) => a.toString());

        console.log("[IPFS] Helia node started.");
        console.log("[IPFS] PeerId:", peerId);
        console.log("[IPFS] Initial listening addrs:", addrs);

        // Try to connect to local relay for development
        await IPFSService.connectToLocalRelay();

        // Wait for addresses to become available (circuit relay addr)
        await IPFSService.waitForAddresses(5000);

        // Log final addresses available for peer discovery
        const finalAddrs = IPFSService.getMultiaddrs();
        console.log("[IPFS] Final multiaddrs for discovery:", finalAddrs.length, finalAddrs);

        // Log registered protocols to verify bitswap is active
        const protocols = heliaInstance.libp2p.getProtocols();
        console.log("[IPFS] Registered protocols:", protocols);

        // Log connection events for debugging
        heliaInstance.libp2p.addEventListener('peer:connect', (evt) => {
          console.log("[IPFS] Peer connected:", evt.detail.toString().slice(0, 20) + "...");
        });
        heliaInstance.libp2p.addEventListener('peer:disconnect', (evt) => {
          console.log("[IPFS] Peer disconnected:", evt.detail.toString().slice(0, 20) + "...");
        });

        // Log current connections
        const connections = heliaInstance.libp2p.getConnections();
        console.log("[IPFS] Initial connections:", connections.length);
        for (const conn of connections) {
          console.log("[IPFS]   Peer:", conn.remotePeer.toString().slice(0, 16), "| Addr:", conn.remoteAddr.toString().slice(0, 50));
        }

        // Expose for console debugging
        // @ts-expect-error - intentionally adding to window for debugging
        if (typeof window !== 'undefined') window.IPFSService = IPFSService;
      } catch (err) {
        console.error("[IPFS] Failed to start Helia node:", err);
        initPromise = null;
        throw err;
      }
    })();

    return initPromise;
  }

  /**
   * Check if IPFS is initialized and ready.
   */
  static isReady(): boolean {
    return heliaInstance !== null && fsInstance !== null;
  }

  /**
   * Get the UnixFS interface for file operations.
   */
  static getFS(): UnixFS {
    if (!fsInstance) {
      throw new Error("IPFS not initialized. Call IPFSService.init() first.");
    }
    return fsInstance;
  }

  /**
   * Get the raw Helia instance (for advanced operations).
   */
  static getHelia(): Helia {
    if (!heliaInstance) {
      throw new Error("IPFS not initialized.");
    }
    return heliaInstance;
  }

  /**
   * Get this node's PeerId as string.
   */
  static getPeerId(): string {
    if (!heliaInstance) throw new Error("IPFS not initialized.");
    return heliaInstance.libp2p.peerId.toString();
  }

  /**
   * Get the circuit relay address that others can use to reach us.
   * Returns null if not connected to a relay.
   */
  static getCircuitRelayAddress(): string | null {
    if (!heliaInstance || !relayMultiaddr || !relayPeerId) return null;
    const ourPeerId = heliaInstance.libp2p.peerId.toString();
    return `${relayMultiaddr}/p2p/${relayPeerId}/p2p-circuit/p2p/${ourPeerId}`;
  }

  /**
   * Get this node's multiaddrs for peer advertisement.
   * Includes circuit relay address if connected to a relay.
   */
  static getMultiaddrs(): string[] {
    if (!heliaInstance) return [];
    
    const addrs = heliaInstance.libp2p.getMultiaddrs().map((a) => a.toString());
    
    // Add circuit relay address if we're connected to a relay
    // This is critical for browser nodes which can't accept incoming connections
    const circuitAddr = IPFSService.getCircuitRelayAddress();
    if (circuitAddr && !addrs.includes(circuitAddr)) {
      addrs.push(circuitAddr);
    }
    
    return addrs;
  }

  /**
   * Get connected peer count.
   */
  static getConnectedPeers(): number {
    if (!heliaInstance) return 0;
    return heliaInstance.libp2p.getConnections().length;
  }

  /**
   * Connect to a peer by multiaddr.
   * Used when we know another user's IPFS address and want to fetch their content.
   */
  static async connectToPeer(multiaddrStr: string): Promise<void> {
    if (!heliaInstance) throw new Error("IPFS not initialized.");

    const ma = multiaddr(multiaddrStr);

    try {
      await heliaInstance.libp2p.dial(ma);
      console.log("[IPFS] Connected to peer:", multiaddrStr);
    } catch (err) {
      // NO_RESERVATION means the peer's relay slot expired (they're offline)
      // This is expected for stale peer data and not a real error
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes("NO_RESERVATION")) {
        console.log("[IPFS] Peer offline (no relay reservation):", multiaddrStr.slice(-20));
      } else {
        console.warn("[IPFS] Failed to connect to peer:", multiaddrStr.slice(-30), errMsg);
      }
      throw err;
    }
  }

  /**
   * Connect to a peer by PeerId (if we already have a connection path).
   */
  static async connectToPeerId(peerIdStr: string): Promise<void> {
    if (!heliaInstance) throw new Error("IPFS not initialized.");

    const peerId = peerIdFromString(peerIdStr);

    try {
      await heliaInstance.libp2p.dial(peerId);
      console.log("[IPFS] Connected to peer by ID:", peerIdStr);
    } catch (err) {
      console.warn("[IPFS] Failed to connect to peer by ID:", peerIdStr, err);
      throw err;
    }
  }

  /**
   * Connect to the local libp2p relay server.
   * This enables circuit relay connections for NAT-ed peers.
   * 
   * Set VITE_RELAY_IP environment variable to specify custom relay IP.
   */
  static async connectToLocalRelay(): Promise<void> {
    if (!heliaInstance) return;

    // Check for custom relay IP from environment
    // @ts-expect-error - Vite env variable
    const customRelayIp = typeof import.meta?.env?.VITE_RELAY_IP === 'string' 
      // @ts-expect-error - Vite env variable
      ? import.meta.env.VITE_RELAY_IP 
      : null;

    // Try common relay addresses (localhost + LAN IPs for cross-device testing)
    // The relay binds to 0.0.0.0 so it's accessible via any interface
    const relayAddresses: string[] = [];
    
    // Custom IP takes priority
    if (customRelayIp) {
      relayAddresses.push(`/ip4/${customRelayIp}/tcp/9010/ws`);
      console.log("[IPFS] Using custom relay IP:", customRelayIp);
    }
    
    // Then localhost (same device)
    relayAddresses.push(
      "/ip4/127.0.0.1/tcp/9010/ws",
      "/ip4/localhost/tcp/9010/ws",
      // Common LAN ranges - try to find relay on local network
      "/ip4/192.168.1.65/tcp/9010/ws",
      "/ip4/192.168.0.1/tcp/9010/ws",
      "/ip4/10.0.0.1/tcp/9010/ws",
      // Fallback ports
      "/ip4/127.0.0.1/tcp/9002/ws",
    );

    for (const addr of relayAddresses) {
      try {
        console.log("[IPFS] Attempting to connect to relay:", addr);
        const ma = multiaddr(addr);
        const connection = await heliaInstance.libp2p.dial(ma);
        relayMultiaddr = addr;
        relayPeerId = connection.remotePeer.toString();
        console.log("[IPFS] Connected to local relay:", addr);
        console.log("[IPFS] Relay peer ID:", relayPeerId);
        
        // Log our circuit relay address (this is what others can use to reach us)
        const ourPeerId = heliaInstance.libp2p.peerId.toString();
        const circuitAddr = `${addr}/p2p/${relayPeerId}/p2p-circuit/p2p/${ourPeerId}`;
        console.log("[IPFS] Our circuit relay address:", circuitAddr);
        return;
      } catch (err) {
        console.log("[IPFS] Failed to connect to", addr, "-", err instanceof Error ? err.message : String(err));
        // Try next address
      }
    }

    console.log("[IPFS] No local relay found (run: node scripts/libp2p-relay.mjs)");
  }

  /**
   * Get the relay multiaddr if connected.
   */
  static getRelayAddr(): string | null {
    return relayMultiaddr;
  }

  /**
   * Wait until we have at least one multiaddr available for peer discovery.
   * This is important for browser nodes that rely on circuit relay addresses.
   * 
   * @param timeoutMs - Maximum time to wait for addresses
   */
  static async waitForAddresses(timeoutMs: number = 5000): Promise<void> {
    const start = Date.now();
    
    while (Date.now() - start < timeoutMs) {
      const addrs = IPFSService.getMultiaddrs();
      if (addrs.length > 0) {
        console.log("[IPFS] Addresses available:", addrs.length);
        return;
      }
      await new Promise(r => setTimeout(r, 200));
    }
    
    console.warn("[IPFS] Timed out waiting for addresses. Node may be isolated.");
  }

  /**
   * Connect to a peer via circuit relay.
   * Use this when direct connection fails.
   * 
   * @param targetPeerId - The peer ID to connect to via relay
   */
  static async connectViaRelay(targetPeerId: string): Promise<void> {
    if (!heliaInstance) throw new Error("IPFS not initialized.");
    if (!relayMultiaddr || !relayPeerId) {
      console.warn("[IPFS] No relay available for circuit connection");
      return;
    }
    
    // Construct circuit relay address
    // Format: /relay-addr/p2p/relay-peer-id/p2p-circuit/p2p/target-peer-id
    const circuitAddr = `${relayMultiaddr}/p2p/${relayPeerId}/p2p-circuit/p2p/${targetPeerId}`;
    
    console.log("[IPFS] Attempting circuit relay connection:", circuitAddr);
    
    try {
      const ma = multiaddr(circuitAddr);
      await heliaInstance.libp2p.dial(ma);
      console.log("[IPFS] Connected via circuit relay to:", targetPeerId.slice(0, 12));
    } catch (err) {
      console.warn("[IPFS] Circuit relay connection failed:", err);
      throw err;
    }
  }

  /**
   * Upload a file to IPFS.
   * Returns the CID as a string.
   *
   * @param data - File content as Uint8Array
   * @param onProgress - Optional progress callback (0-100)
   */
  static async upload(
    data: Uint8Array,
    onProgress?: (percent: number) => void
  ): Promise<string> {
    // Ensure IPFS is initialized
    await IPFSService.init();
    const fs = IPFSService.getFS();

    console.log("[IPFS] Uploading", data.length, "bytes...");

    // UnixFS add returns a CID
    const cid = await fs.addBytes(data, {
      // Progress tracking
      onProgress: onProgress
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? (event: any) => {
            // Helia progress events vary — normalize to percent
            if (
              event.type === "unixfs:importer:progress:file:write" &&
              event.detail?.bytesWritten
            ) {
              // Approximate progress based on bytes written
              onProgress(
                Math.min(99, (event.detail.bytesWritten / data.length) * 100)
              );
            }
          }
        : undefined,
    });

    // Pin locally so the file persists as long as our node is running
    try {
      await IPFSService.getHelia().pins.add(cid);
    } catch (err) {
      // Pinning might fail in some configurations, log but don't fail
      console.warn("[IPFS] Failed to pin CID:", err);
    }

    // Also save to download cache for instant local retrieval
    // This ensures the uploader can always view their own content
    setCachedDownload(cid.toString(), data).catch(() => {
      // Fire and forget
    });

    if (onProgress) onProgress(100);

    console.log("[IPFS] Upload complete. CID:", cid.toString());

    return cid.toString();
  }

  /**
   * Download a file from IPFS by CID.
   * Returns the file content as Uint8Array.
   *
   * @param cidString - The CID to download
   * @param timeoutMs - How long to wait before giving up (default 30s)
   */
  static async download(
    cidString: string,
    timeoutMs: number = 30000
  ): Promise<Uint8Array> {
    // Check if download already in progress for this CID
    const existing = inflightDownloads.get(cidString);
    if (existing) {
      console.log("[IPFS] Reusing in-flight download for CID:", cidString);
      return existing;
    }

    // Create the download promise
    const downloadPromise = IPFSService._doDownload(cidString, timeoutMs);
    inflightDownloads.set(cidString, downloadPromise);

    try {
      return await downloadPromise;
    } finally {
      // Remove from cache after completion (success or failure)
      inflightDownloads.delete(cidString);
    }
  }

  /**
   * Internal download implementation.
   */
  private static async _doDownload(
    cidString: string,
    timeoutMs: number
  ): Promise<Uint8Array> {
    // Check IndexedDB cache first (fast path for previously downloaded content)
    const cached = await getCachedDownload(cidString);
    if (cached) {
      console.log("[IPFS] Cache hit for CID:", cidString, "Size:", cached.length);
      return cached;
    }

    // Ensure IPFS is initialized
    await IPFSService.init();
    const fs = IPFSService.getFS();
    const cid = CID.parse(cidString);

    console.log("[IPFS] Downloading CID:", cidString);
    console.log("[IPFS] Connected peers:", IPFSService.getConnectedPeers());
    
    // Log detailed peer info for debugging
    if (heliaInstance) {
      const connections = heliaInstance.libp2p.getConnections();
      console.log("[IPFS] Detailed peer connections:");
      for (const conn of connections) {
        console.log("[IPFS]   ", conn.remotePeer.toString().slice(0, 16), 
                    "| streams:", conn.streams.length,
                    "| direction:", conn.direction,
                    "| addr:", conn.remoteAddr.toString().slice(-40));
      }
    }

    const chunks: Uint8Array[] = [];

    // Create an AbortController for timeout
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      for await (const chunk of fs.cat(cid, { signal: controller.signal })) {
        chunks.push(chunk);
      }
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === "AbortError" || controller.signal.aborted) {
        throw new Error(
          `IPFS download timed out after ${timeoutMs / 1000}s for CID: ${cidString}`
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    // Combine chunks into single array
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }

    console.log("[IPFS] Download complete. Size:", result.length, "bytes");

    // Save to IndexedDB cache for offline access
    setCachedDownload(cidString, result).catch(() => {
      // Fire and forget - don't block return
    });

    return result;
  }

  /**
   * Download with peer hint — try connecting to specific peer first.
   * This is the key method for cross-user file resolution.
   *
   * @param cidString - The CID to download
   * @param peerMultiaddrs - Multiaddrs of the peer likely to have the content
   * @param timeoutMs - How long to wait before giving up
   */
  static async downloadWithPeerHint(
    cidString: string,
    peerMultiaddrs: string[],
    timeoutMs: number = 15000
  ): Promise<Uint8Array> {
    // Check IndexedDB cache first (before any network activity)
    const cached = await getCachedDownload(cidString);
    if (cached) {
      console.log("[IPFS] Cache hit for CID:", cidString, "Size:", cached.length);
      return cached;
    }

    console.log("[IPFS] Download with peer hint. CID:", cidString);
    console.log("[IPFS] Peer hints:", peerMultiaddrs.length);

    // First, try connecting to the hinted peers
    for (const addr of peerMultiaddrs) {
      try {
        await IPFSService.connectToPeer(addr);
        break; // One successful connection is enough
      } catch {
        // Continue trying other addrs
      }
    }

    // Now attempt the download — bitswap will query connected peers
    return IPFSService.download(cidString, timeoutMs);
  }

  /**
   * Check if a CID exists locally (is pinned).
   */
  static async hasLocally(cidString: string): Promise<boolean> {
    try {
      const helia = IPFSService.getHelia();

      for await (const pin of helia.pins.ls()) {
        if (pin.cid.toString() === cidString) return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Diagnostic: Check blockstore status for a CID
   */
  static async diagnose(cidString: string): Promise<void> {
    console.log("=== IPFS Diagnostic for CID:", cidString, "===");
    
    try {
      const helia = IPFSService.getHelia();
      const cid = CID.parse(cidString);
      
      // Check blockstore
      const hasBlock = await helia.blockstore.has(cid);
      console.log("[IPFS Diag] In blockstore:", hasBlock);
      
      // Check pins
      let isPinned = false;
      for await (const pin of helia.pins.ls()) {
        if (pin.cid.toString() === cidString) {
          isPinned = true;
          break;
        }
      }
      console.log("[IPFS Diag] Is pinned:", isPinned);
      
      // Check download cache
      const cached = await getCachedDownload(cidString);
      console.log("[IPFS Diag] In download cache:", cached ? `${cached.length} bytes` : "no");
      
      // Check connections
      const connections = helia.libp2p.getConnections();
      console.log("[IPFS Diag] Connections:", connections.length);
      for (const conn of connections) {
        console.log("[IPFS Diag]   ", conn.remotePeer.toString().slice(0, 16), 
                    "| streams:", conn.streams.length,
                    "| protocols:", conn.streams.map(s => s.protocol?.split('/').pop()).join(',') || 'none');
      }
      
    } catch (err) {
      console.error("[IPFS Diag] Error:", err);
    }
    
    console.log("=== End Diagnostic ===");
  }

  /**
   * Stop the Helia node (call on app shutdown).
   */
  static async stop(): Promise<void> {
    if (heliaInstance) {
      try {
        await heliaInstance.stop();
        console.log("[IPFS] Helia node stopped.");
      } catch (err) {
        console.error("[IPFS] Error stopping Helia:", err);
      }
      heliaInstance = null;
      fsInstance = null;
      initPromise = null;
    }
  }
}
