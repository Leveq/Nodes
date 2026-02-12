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
  ConnectionState,
} from "@nodes/transport";
import {
  GunMessageTransport,
  GunPresenceTransport,
  GunConnectionMonitor,
  LocalFileTransport,
} from "@nodes/transport-gun";

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

  // Reactive connection state
  connectionState: ConnectionState;

  // Convenience methods
  isConnected: boolean;
  reconnect: () => Promise<void>;
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
      file: new LocalFileTransport(),
    }),
    []
  );

  // Track connection state reactively
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    connected: false,
    status: "connecting",
    peerCount: 0,
    lastConnected: null,
    reconnectAttempts: 0,
  });

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
      connectionState,
      isConnected: connectionState.connected,
      reconnect,
    }),
    [transports, connectionState, reconnect]
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
