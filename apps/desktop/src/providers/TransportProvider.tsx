import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
  type ReactNode,
} from "react";
import type {
  IMessageTransport,
  IPresenceTransport,
  IConnectionMonitor,
  IFileTransport,
  IVoiceTransport,
  ConnectionState,
} from "@nodes/transport";
import {
  GunMessageTransport,
  GunPresenceTransport,
  GunConnectionMonitor,
  IPFSFileTransport,
  IPFSService,
  getIPFSPeerAdvertiser,
  VoiceManager,
} from "@nodes/transport-gun";
import { useIdentityStore } from "../stores/identity-store";
import { useNodeStore } from "../stores/node-store";
import { useVoiceStore } from "../stores/voice-store";

/**
 * Transport context shape.
 * Provides access to all transport interfaces and connection state.
 */
interface TransportContextValue {
  // Transport instances
  message: IMessageTransport;
  presence: IPresenceTransport;
  connection: IConnectionMonitor;
  file: IFileTransport;
  voice: IVoiceTransport | null;

  // Reactive connection state
  connectionState: ConnectionState;

  // Convenience methods
  isConnected: boolean;
  reconnect: () => Promise<void>;

  // IPFS state
  ipfsReady: boolean;
}

const TransportContext = createContext<TransportContextValue | null>(null);

/**
 * TransportProvider initializes and provides all transport instances.
 * Wraps the app to give components access to messaging, presence, etc.
 */
export function TransportProvider({ children }: { children: ReactNode }) {
  // Initialize transports once (singleton pattern)
  const transports = useMemo(
    () => ({
      message: new GunMessageTransport(),
      presence: new GunPresenceTransport(),
      connection: new GunConnectionMonitor(),
      file: new IPFSFileTransport(),
    }),
    []
  );

  // IPFS initialization state
  const [ipfsReady, setIpfsReady] = useState(false);

  // Get public key for peer advertising
  const publicKey = useIdentityStore((s) => s.publicKey);
  const members = useNodeStore((s) => s.members);
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  
  // Voice store actions
  const setVoiceState = useVoiceStore((s) => s.setState);
  const setVoiceParticipants = useVoiceStore((s) => s.setParticipants);
  const updateParticipantSpeaking = useVoiceStore((s) => s.updateParticipantSpeaking);

  // Initialize voice manager when we have a public key
  const voiceManager = useMemo(() => {
    if (!publicKey) return null;
    return new VoiceManager(publicKey);
  }, [publicKey]);

  // Track connection state reactively
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    status: "connecting",
    peerCount: 0,
    lastConnected: null,
    reconnectAttempts: 0,
  });

  // Initialize IPFS on mount
  useEffect(() => {
    IPFSService.init()
      .then(() => {
        setIpfsReady(true);
        console.log("[IPFS] Ready for file operations");
      })
      .catch((err) => {
        console.error("[IPFS] Failed to initialize:", err);
        // Don't fail the whole app - file sharing just won't work
      });

    return () => {
      getIPFSPeerAdvertiser().stop();
      IPFSService.stop();
    };
  }, []);

  // Start IPFS peer advertising when we have identity and IPFS is ready
  useEffect(() => {
    if (!ipfsReady || !publicKey) return;

    const advertiser = getIPFSPeerAdvertiser();
    advertiser.start(publicKey).catch(console.error);

    return () => {
      // Don't stop here - stop in the IPFS cleanup effect above
    };
  }, [ipfsReady, publicKey]);

  // Connect to Node members' IPFS nodes when active Node changes
  useEffect(() => {
    if (!ipfsReady || !publicKey || !activeNodeId) return;

    const nodeMembers = members[activeNodeId] || [];
    const memberKeys = nodeMembers.map((m) => m.publicKey);

    if (memberKeys.length > 0) {
      const advertiser = getIPFSPeerAdvertiser();
      advertiser.connectToNodeMembers(memberKeys).catch(console.error);
      advertiser.subscribeToMembers(memberKeys);
    }
  }, [ipfsReady, publicKey, activeNodeId, members]);

  // Start connection monitoring on mount
  useEffect(() => {
    transports.connection.start();

    const unsubscribe = transports.connection.onStateChange((state) => {
      setConnectionState(state);
    });

    // Expose transports on window for dev testing
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).transports = transports;
      console.log(
        '%c[Dev] Transports exposed on window.transports',
        'color: #0ea5e9',
        '\n  - window.transports.message.send("test-channel", "Hello!")',
        '\n  - window.transports.message.subscribe("test-channel", console.log)'
      );
    }

    return () => {
      unsubscribe();
      transports.connection.stop();
    };
  }, [transports.connection]);

  // Subscribe to voice state changes
  useEffect(() => {
    if (!voiceManager) return;

    const unsubState = voiceManager.onStateChange((state) => {
      setVoiceState(state);
    });

    const unsubParticipants = voiceManager.onParticipantsChange((participants) => {
      setVoiceParticipants(participants);
    });

    const unsubSpeaking = voiceManager.onSpeakingChange((publicKey, speaking) => {
      updateParticipantSpeaking(publicKey, speaking);
    });

    return () => {
      unsubState();
      unsubParticipants();
      unsubSpeaking();
    };
  }, [voiceManager, setVoiceState, setVoiceParticipants, updateParticipantSpeaking]);

  // Convenience method for reconnecting
  const reconnect = useCallback(async () => {
    await transports.connection.reconnect();
  }, [transports.connection]);

  const value = useMemo<TransportContextValue>(
    () => ({
      message: transports.message,
      presence: transports.presence,
      connection: transports.connection,
      file: transports.file,
      voice: voiceManager,
      connectionState,
      isConnected: connectionState.connected,
      reconnect,
      ipfsReady,
    }),
    [transports, voiceManager, connectionState, reconnect, ipfsReady]
  );

  return (
    <TransportContext.Provider value={value}>
      {children}
    </TransportContext.Provider>
  );
}

/**
 * Hook to access transport context.
 * Throws if used outside TransportProvider.
 */
export function useTransport(): TransportContextValue {
  const context = useContext(TransportContext);
  if (!context) {
    throw new Error("useTransport must be used within TransportProvider");
  }
  return context;
}

/**
 * Hook to access just the connection state.
 * Useful for components that only care about connectivity.
 */
export function useConnectionState(): ConnectionState & {
  isConnected: boolean;
  reconnect: () => Promise<void>;
} {
  const { connectionState, isConnected, reconnect } = useTransport();
  return { ...connectionState, isConnected, reconnect };
}

/**
 * Hook to access just the message transport.
 */
export function useMessageTransport(): IMessageTransport {
  return useTransport().message;
}

/**
 * Hook to access just the presence transport.
 */
export function usePresenceTransport(): IPresenceTransport {
  return useTransport().presence;
}

/**
 * Hook to access just the file transport.
 */
export function useFileTransport(): IFileTransport {
  return useTransport().file;
}

/**
 * Hook to access just the voice transport.
 */
export function useVoiceTransport(): IVoiceTransport | null {
  return useTransport().voice;
}
