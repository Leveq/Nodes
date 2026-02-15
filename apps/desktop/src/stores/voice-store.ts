import { create } from "zustand";
import type { VoiceState, VoiceParticipant, NodeVoiceConfig } from "@nodes/core";

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
  
  setInputDevice: (deviceId) => set({ inputDeviceId: deviceId }),
  
  setOutputDevice: (deviceId) => set({ outputDeviceId: deviceId }),
  
  setInputVolume: (volume) => set({ inputVolume: Math.max(0, Math.min(100, volume)) }),
  
  setPushToTalk: (enabled, key) => set({ 
    pushToTalk: enabled, 
    pushToTalkKey: key ?? null 
  }),
  
  setNoiseSuppression: (enabled) => set({ noiseSuppression: enabled }),
  
  setEchoCancellation: (enabled) => set({ echoCancellation: enabled }),
  
  updateParticipantSpeaking: (publicKey, speaking) => set((state) => ({
    participants: state.participants.map((p) =>
      p.publicKey === publicKey ? { ...p, speaking } : p
    ),
  })),
  
  reset: () => set({
    state: DEFAULT_STATE,
    participants: [],
  }),
}));
