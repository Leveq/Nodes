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
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function saveSettingsDebounced(settings: VoiceSettings) {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    setCache(CacheKeys.voiceSettings(), settings).catch((err) =>
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
  
  setState: (state) => set({ state }),
  
  setParticipants: (participants) => set({ participants }),
  
  setNodeConfig: (config) => set({ nodeConfig: config }),
  
  setInputDevice: (deviceId) => {
    set({ inputDeviceId: deviceId });
    const s = useVoiceStore.getState();
    saveSettingsDebounced({ inputDeviceId: deviceId, outputDeviceId: s.outputDeviceId, inputVolume: s.inputVolume, pushToTalk: s.pushToTalk, pushToTalkKey: s.pushToTalkKey, noiseSuppression: s.noiseSuppression, echoCancellation: s.echoCancellation });
  },
  
  setOutputDevice: (deviceId) => {
    set({ outputDeviceId: deviceId });
    const s = useVoiceStore.getState();
    saveSettingsDebounced({ inputDeviceId: s.inputDeviceId, outputDeviceId: deviceId, inputVolume: s.inputVolume, pushToTalk: s.pushToTalk, pushToTalkKey: s.pushToTalkKey, noiseSuppression: s.noiseSuppression, echoCancellation: s.echoCancellation });
  },
  
  setInputVolume: (volume) => {
    const clamped = Math.max(0, Math.min(100, volume));
    set({ inputVolume: clamped });
    const s = useVoiceStore.getState();
    saveSettingsDebounced({ inputDeviceId: s.inputDeviceId, outputDeviceId: s.outputDeviceId, inputVolume: clamped, pushToTalk: s.pushToTalk, pushToTalkKey: s.pushToTalkKey, noiseSuppression: s.noiseSuppression, echoCancellation: s.echoCancellation });
  },
  
  setPushToTalk: (enabled, key) => {
    set({ pushToTalk: enabled, pushToTalkKey: key ?? null });
    const s = useVoiceStore.getState();
    saveSettingsDebounced({ inputDeviceId: s.inputDeviceId, outputDeviceId: s.outputDeviceId, inputVolume: s.inputVolume, pushToTalk: enabled, pushToTalkKey: key ?? null, noiseSuppression: s.noiseSuppression, echoCancellation: s.echoCancellation });
  },
  
  setNoiseSuppression: (enabled) => {
    set({ noiseSuppression: enabled });
    const s = useVoiceStore.getState();
    saveSettingsDebounced({ inputDeviceId: s.inputDeviceId, outputDeviceId: s.outputDeviceId, inputVolume: s.inputVolume, pushToTalk: s.pushToTalk, pushToTalkKey: s.pushToTalkKey, noiseSuppression: enabled, echoCancellation: s.echoCancellation });
  },
  
  setEchoCancellation: (enabled) => {
    set({ echoCancellation: enabled });
    const s = useVoiceStore.getState();
    saveSettingsDebounced({ inputDeviceId: s.inputDeviceId, outputDeviceId: s.outputDeviceId, inputVolume: s.inputVolume, pushToTalk: s.pushToTalk, pushToTalkKey: s.pushToTalkKey, noiseSuppression: s.noiseSuppression, echoCancellation: enabled });
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
