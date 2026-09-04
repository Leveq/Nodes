import { create } from "zustand";
import type { VoiceState, VoiceParticipant, NodeVoiceConfig } from "@nodes/core";
import { getCache, setCache, CacheKeys } from "../services/app-cache";

/** The subset of voice store state that should persist across restarts. */
interface VoiceSettings {
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  inputVolume: number;
  pushToTalk: boolean;
  pushToTalkKey: string | null;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  /**
   * When true (default, "privacy mode"), voice routes through the LiveKit
   * SFU regardless of participant count to hide participant IP addresses
   * from each other. Fails closed if no SFU is configured or the SFU join
   * fails, rather than silently exposing IPs by falling back to mesh.
   * When false, small rooms (up to MESH_MAX_PARTICIPANTS users) use P2P
   * mesh for lower latency, at the cost of exposing IPs to other
   * participants.
   */
  preferSfu: boolean;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function snapshotSettings(): VoiceSettings {
  const s = useVoiceStore.getState();
  return {
    inputDeviceId: s.inputDeviceId,
    outputDeviceId: s.outputDeviceId,
    inputVolume: s.inputVolume,
    pushToTalk: s.pushToTalk,
    pushToTalkKey: s.pushToTalkKey,
    noiseSuppression: s.noiseSuppression,
    echoCancellation: s.echoCancellation,
    preferSfu: s.preferSfu,
  };
}

function saveSettingsDebounced() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    setCache(CacheKeys.voiceSettings(), snapshotSettings()).catch((err) =>
      console.warn("[VoiceStore] Failed to save settings:", err)
    );
  }, 500);
}

interface VoiceStore {
  // Current voice connection state
  state: VoiceState;
  // Participants in the current voice channel
  participants: VoiceParticipant[];
  // Voice configuration for the current Node
  nodeConfig: NodeVoiceConfig | null;
  
  // Audio device settings
  inputDeviceId: string | null;
  outputDeviceId: string | null;
  inputVolume: number; // 0-100
  
  // User preferences
  pushToTalk: boolean;
  pushToTalkKey: string | null;
  noiseSuppression: boolean;
  echoCancellation: boolean;
  preferSfu: boolean;
  
  // Actions
  setState: (state: VoiceState) => void;
  setParticipants: (participants: VoiceParticipant[]) => void;
  setNodeConfig: (config: NodeVoiceConfig | null) => void;
  setInputDevice: (deviceId: string | null) => void;
  setOutputDevice: (deviceId: string | null) => void;
  setInputVolume: (volume: number) => void;
  setPushToTalk: (enabled: boolean, key?: string) => void;
  setNoiseSuppression: (enabled: boolean) => void;
  setEchoCancellation: (enabled: boolean) => void;
  setPreferSfu: (prefer: boolean) => void;
  
  // Participant helpers
  updateParticipantSpeaking: (publicKey: string, speaking: boolean) => void;
  
  // Persistence
  loadSettings: () => Promise<void>;
  
  // Reset state on disconnect
  reset: () => void;
}

const DEFAULT_STATE: VoiceState = {
  channelId: null,
  tier: null,
  muted: false,
  deafened: false,
  speaking: false,
  connecting: false,
};

export const useVoiceStore = create<VoiceStore>((set) => ({
  state: DEFAULT_STATE,
  participants: [],
  nodeConfig: null,
  
  inputDeviceId: null,
  outputDeviceId: null,
  inputVolume: 100,
  
  pushToTalk: false,
  pushToTalkKey: null,
  noiseSuppression: true,
  echoCancellation: true,
  preferSfu: true,
  
  setState: (state) => set({ state }),
  
  setParticipants: (participants) => set({ participants }),
  
  setNodeConfig: (config) => set({ nodeConfig: config }),
  
  setInputDevice: (deviceId) => {
    set({ inputDeviceId: deviceId });
    saveSettingsDebounced();
  },
  
  setOutputDevice: (deviceId) => {
    set({ outputDeviceId: deviceId });
    saveSettingsDebounced();
  },
  
  setInputVolume: (volume) => {
    const clamped = Math.max(0, Math.min(100, volume));
    set({ inputVolume: clamped });
    saveSettingsDebounced();
  },
  
  setPushToTalk: (enabled, key) => {
    set({ pushToTalk: enabled, pushToTalkKey: key ?? null });
    saveSettingsDebounced();
  },
  
  setNoiseSuppression: (enabled) => {
    set({ noiseSuppression: enabled });
    saveSettingsDebounced();
  },
  
  setEchoCancellation: (enabled) => {
    set({ echoCancellation: enabled });
    saveSettingsDebounced();
  },
  
  setPreferSfu: (prefer) => {
    set({ preferSfu: prefer });
    saveSettingsDebounced();
  },
  
  updateParticipantSpeaking: (publicKey, speaking) => set((state) => ({
    participants: state.participants.map((p) =>
      p.publicKey === publicKey ? { ...p, speaking } : p
    ),
  })),
  
  loadSettings: async () => {
    try {
      const saved = await getCache<VoiceSettings>(CacheKeys.voiceSettings());
      if (saved) {
        set({
          inputDeviceId: saved.inputDeviceId,
          outputDeviceId: saved.outputDeviceId,
          inputVolume: saved.inputVolume,
          pushToTalk: saved.pushToTalk,
          pushToTalkKey: saved.pushToTalkKey,
          noiseSuppression: saved.noiseSuppression,
          echoCancellation: saved.echoCancellation,
          // Default to true for users upgrading from versions before #66
          preferSfu: saved.preferSfu ?? true,
        });
      }
    } catch (err) {
      console.warn("[VoiceStore] Failed to load settings:", err);
    }
  },
  
  reset: () => set({
    state: DEFAULT_STATE,
    participants: [],
  }),
}));
