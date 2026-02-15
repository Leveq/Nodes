import {
  Room,
  RoomEvent,
  Track,
  Participant,
  RemoteParticipant,
  createLocalAudioTrack,
  ConnectionState,
} from "livekit-client";
import type { VoiceState, VoiceParticipant } from "@nodes/core";
import type { Unsubscribe } from "@nodes/transport";

/**
 * LiveKitVoiceTransport connects to a LiveKit SFU server for larger voice rooms.
 *
 * The LiveKit server forwards audio packets between participants.
 * Each participant sends one audio stream to the server.
 * The server selectively forwards streams to all other participants.
 *
 * Token generation: For self-hosted Nodes, the token is generated client-side
 * using the Node's LiveKit API key and secret. For production, tokens should
 * come from a server-side endpoint.
 */
export class LiveKitVoiceTransport {
  private room: Room | null = null;
  private channelId: string | null = null;
  private publicKey: string;
  private stateHandlers: Set<(state: VoiceState) => void> = new Set();
  private participantHandlers: Set<(participants: VoiceParticipant[]) => void> = new Set();
  private speakingHandlers: Set<(publicKey: string, speaking: boolean) => void> = new Set();

  private state: VoiceState = {
    channelId: null,
    tier: null,
    muted: false,
    deafened: false,
    speaking: false,
    connecting: false,
  };

  constructor(publicKey: string) {
    this.publicKey = publicKey;
  }

  /**
   * Join a voice channel via LiveKit SFU.
   *
   * @param channelId - The voice channel ID
   * @param serverUrl - LiveKit server WebSocket URL (wss://...)
   * @param token - JWT access token for the room
   */
  async join(channelId: string, serverUrl: string, token: string): Promise<void> {
    if (this.room) {
      await this.leave();
    }

    this.state = { ...this.state, connecting: true, channelId };
    this.emitState();

    try {
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Set up event listeners BEFORE connecting
      this.setupRoomListeners();

      // Connect to the LiveKit server
      await this.room.connect(serverUrl, token);

      // Publish local audio
      const audioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
      await this.room.localParticipant.publishTrack(audioTrack);

      this.channelId = channelId;
      this.state = {
        ...this.state,
        connecting: false,
        tier: "livekit",
        channelId,
      };
      this.emitState();
      this.emitParticipants();

    } catch (error) {
      this.state = { ...this.state, connecting: false, channelId: null };
      this.emitState();
      throw error;
    }
  }

  /**
   * Set up LiveKit room event listeners.
   */
  private setupRoomListeners(): void {
    if (!this.room) return;

    // Participant joined
    this.room.on(RoomEvent.ParticipantConnected, (_participant: RemoteParticipant) => {
      this.emitParticipants();
    });

    // Participant left
    this.room.on(RoomEvent.ParticipantDisconnected, (_participant: RemoteParticipant) => {
      this.emitParticipants();
    });

    // Track subscribed (remote audio available)
    this.room.on(RoomEvent.TrackSubscribed, (track, _publication, _participant) => {
      if (track.kind === Track.Kind.Audio) {
        // LiveKit handles audio playback automatically
        this.emitParticipants();
      }
    });

    // Active speakers changed (VAD)
    this.room.on(RoomEvent.ActiveSpeakersChanged, (speakers: Participant[]) => {
      const speakerKeys = new Set(speakers.map((s) => s.identity));

      // Emit speaking changes
      if (this.room) {
        for (const participant of this.room.remoteParticipants.values()) {
          const isSpeaking = speakerKeys.has(participant.identity);
          this.emitSpeaking(participant.identity, isSpeaking);
        }
      }

      // Local speaking state
      const localSpeaking = speakerKeys.has(this.publicKey);
      if (localSpeaking !== this.state.speaking) {
        this.state = { ...this.state, speaking: localSpeaking };
        this.emitState();
      }
    });

    // Connection state changes
    this.room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      if (state === ConnectionState.Disconnected) {
        this.state = { ...this.state, channelId: null, tier: null, connecting: false };
        this.emitState();
      } else if (state === ConnectionState.Reconnecting) {
        this.state = { ...this.state, connecting: true };
        this.emitState();
      } else if (state === ConnectionState.Connected) {
        this.state = { ...this.state, connecting: false };
        this.emitState();
      }
    });

    // Track mute state changes
    this.room.on(RoomEvent.TrackMuted, (_track, _participant) => {
      this.emitParticipants();
    });

    this.room.on(RoomEvent.TrackUnmuted, (_track, _participant) => {
      this.emitParticipants();
    });
  }

  /**
   * Leave the voice channel.
   */
  async leave(): Promise<void> {
    if (this.room) {
      await this.room.disconnect(true);
      this.room = null;
    }

    this.channelId = null;
    this.state = {
      channelId: null,
      tier: null,
      muted: false,
      deafened: false,
      speaking: false,
      connecting: false,
    };
    this.emitState();
    this.emitParticipants();
  }

  async setMuted(muted: boolean): Promise<void> {
    this.state = { ...this.state, muted };

    if (this.room) {
      const localParticipant = this.room.localParticipant;
      for (const publication of localParticipant.audioTrackPublications.values()) {
        if (publication.track) {
          if (muted) {
            await publication.track.mute();
          } else {
            await publication.track.unmute();
          }
        }
      }
    }

    this.emitState();
  }

  async setDeafened(deafened: boolean): Promise<void> {
    this.state = { ...this.state, deafened };

    // Also mute self when deafening
    if (deafened && !this.state.muted) {
      await this.setMuted(true);
    }

    // Enable/disable all remote audio tracks
    if (this.room) {
      for (const participant of this.room.remoteParticipants.values()) {
        for (const publication of participant.audioTrackPublications.values()) {
          if (publication.track) {
            if (deafened) {
              publication.track.detach();
            } else {
              publication.track.attach();
            }
          }
        }
      }
    }

    this.emitState();
  }

  // ── Helper methods ──

  private emitState(): void {
    for (const handler of this.stateHandlers) {
      handler(this.state);
    }
  }

  private emitParticipants(): void {
    if (!this.room) {
      for (const handler of this.participantHandlers) {
        handler([]);
      }
      return;
    }

    const participants: VoiceParticipant[] = [];

    // Add remote participants
    for (const participant of this.room.remoteParticipants.values()) {
      const isMuted = Array.from(participant.audioTrackPublications.values())
        .every(pub => pub.isMuted);

      participants.push({
        publicKey: participant.identity,
        displayName: participant.name || participant.identity.slice(0, 8),
        muted: isMuted,
        deafened: false, // LiveKit doesn't track deafen state
        speaking: participant.isSpeaking,
        serverMuted: false,
      });
    }

    for (const handler of this.participantHandlers) {
      handler(participants);
    }
  }

  private emitSpeaking(publicKey: string, speaking: boolean): void {
    for (const handler of this.speakingHandlers) {
      handler(publicKey, speaking);
    }
  }

  // ── Subscription methods ──

  getState(): VoiceState {
    return this.state;
  }

  onStateChange(handler: (state: VoiceState) => void): Unsubscribe {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  onParticipantsChange(handler: (participants: VoiceParticipant[]) => void): Unsubscribe {
    this.participantHandlers.add(handler);
    return () => this.participantHandlers.delete(handler);
  }

  onSpeakingChange(handler: (publicKey: string, speaking: boolean) => void): Unsubscribe {
    this.speakingHandlers.add(handler);
    return () => this.speakingHandlers.delete(handler);
  }

  // ── Device selection ──

  async setInputDevice(deviceId: string): Promise<void> {
    if (!this.room) return;

    // Create new track with specified device
    const newTrack = await createLocalAudioTrack({
      deviceId: { exact: deviceId },
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });

    // Find existing audio publication and replace
    const localParticipant = this.room.localParticipant;
    for (const publication of localParticipant.audioTrackPublications.values()) {
      if (publication.track) {
        // Unpublish old track
        await localParticipant.unpublishTrack(publication.track);
      }
    }

    // Publish new track
    await localParticipant.publishTrack(newTrack);
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    if (!this.room) return;

    // LiveKit's room has switchActiveDevice for output
    await this.room.switchActiveDevice("audiooutput", deviceId);
  }
}
