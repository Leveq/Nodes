import { create } from "zustand";
import { RelayHealthMonitor } from "@nodes/transport-gun";
import type { RelayStatus } from "@nodes/transport-gun";

const CUSTOM_RELAYS_KEY = "nodes_custom_relays";

interface RelayState {
  // State
  relays: RelayStatus[];
  connectedCount: number;
  totalCount: number;
  customRelays: string[];
  isMonitoring: boolean;

  // Actions
  startMonitoring: (urls: string[], customFetch?: typeof fetch) => void;
  stopMonitoring: () => void;
  addCustomRelay: (url: string) => void;
  removeCustomRelay: (url: string) => void;
  getCustomRelays: () => string[];
  reset: () => void;
}

// Singleton health monitor instance
let healthMonitor: RelayHealthMonitor | null = null;

export const useRelayStore = create<RelayState>((set, get) => ({
  relays: [],
  connectedCount: 0,
  totalCount: 0,
  customRelays: [],
  isMonitoring: false,

  startMonitoring: (urls: string[], customFetch?: typeof fetch) => {
    // Load custom relays from localStorage
    const stored = localStorage.getItem(CUSTOM_RELAYS_KEY);
    const customRelays: string[] = stored ? JSON.parse(stored) : [];
    
    // Combine default relays with custom relays
    const allRelays = [...new Set([...urls, ...customRelays])];
    
    // Stop existing monitor if running
    if (healthMonitor) {
      healthMonitor.stop();
    }

    // Create new monitor
    healthMonitor = new RelayHealthMonitor();
    
    // Subscribe to status changes
    healthMonitor.onStatusChange((statuses) => {
      set({
        relays: statuses,
        connectedCount: statuses.filter((r) => r.connected).length,
        totalCount: statuses.length,
      });
    });

    // Start monitoring
    healthMonitor.start(allRelays, undefined, customFetch);
    
    set({
      customRelays,
      totalCount: allRelays.length,
      isMonitoring: true,
    });
  },

  stopMonitoring: () => {
    if (healthMonitor) {
      healthMonitor.stop();
      healthMonitor = null;
    }
    set({ isMonitoring: false });
  },

  addCustomRelay: (url: string) => {
    const { customRelays, relays } = get();
    
    // Validate URL format
    if (!url.startsWith("wss://") && !url.startsWith("ws://")) {
      throw new Error("Relay URL must start with wss:// or ws://");
    }
    
    // Check for duplicates
    if (customRelays.includes(url) || relays.some((r) => r.url === url)) {
      throw new Error("Relay already exists");
    }
    
    const newCustomRelays = [...customRelays, url];
    localStorage.setItem(CUSTOM_RELAYS_KEY, JSON.stringify(newCustomRelays));
    
    // Add to monitoring if active
    if (healthMonitor) {
      // Restart monitoring with new relay list
      const allUrls = [...relays.map((r) => r.url), url];
      healthMonitor.stop();
      healthMonitor = new RelayHealthMonitor();
      healthMonitor.onStatusChange((statuses) => {
        set({
          relays: statuses,
          connectedCount: statuses.filter((r) => r.connected).length,
          totalCount: statuses.length,
        });
      });
      healthMonitor.start(allUrls);
    }
    
    set({ customRelays: newCustomRelays });
  },

  removeCustomRelay: (url: string) => {
    const { customRelays, relays } = get();
    
    const newCustomRelays = customRelays.filter((r) => r !== url);
    localStorage.setItem(CUSTOM_RELAYS_KEY, JSON.stringify(newCustomRelays));
    
    // Restart monitoring without removed relay
    if (healthMonitor) {
      const remainingUrls = relays.map((r) => r.url).filter((u) => u !== url);
      healthMonitor.stop();
      healthMonitor = new RelayHealthMonitor();
      healthMonitor.onStatusChange((statuses) => {
        set({
          relays: statuses,
          connectedCount: statuses.filter((r) => r.connected).length,
          totalCount: statuses.length,
        });
      });
      healthMonitor.start(remainingUrls);
    }
    
    set({ customRelays: newCustomRelays });
  },

  getCustomRelays: () => {
    const stored = localStorage.getItem(CUSTOM_RELAYS_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  reset: () => {
    if (healthMonitor) {
      healthMonitor.stop();
      healthMonitor = null;
    }
    set({
      relays: [],
      connectedCount: 0,
      totalCount: 0,
      customRelays: [],
      isMonitoring: false,
    });
  },
}));

// Export for direct access to health monitor instance
export function getHealthMonitor(): RelayHealthMonitor | null {
  return healthMonitor;
}
