import type { VoiceState, VoiceParticipant } from "@nodes/core";
import { VOICE_CONSTANTS } from "@nodes/core";
import type { Unsubscribe } from "@nodes/transport";
import { GunInstanceManager } from "../gun-instance";

/**
 * MeshVoiceTransport implements peer-to-peer voice using WebRTC mesh.
 *
 * Signaling path in Gun:
 *   gun.get("voice").get(channelId).get("participants").get(publicKey)
 *     → { publicKey, joinedAt, muted, deafened }
 *
 *   gun.get("voice").get(channelId).get("signaling").get(toKey).get(fromKey)
 *     → { type: "offer"|"answer"|"candidate", data: string, timestamp: number }
 *
 * Each peer maintains a RTCPeerConnection to every other peer in the room.
 * Audio flows directly between peers — no server involved.
 */
export class MeshVoiceTransport {
  private connections: Map<string, RTCPeerConnection> = new Map();
  private localStream: MediaStream | null = null;
  private channelId: string | null = null;
  private publicKey: string;
  private participants: Map<string, VoiceParticipant> = new Map();
  private stateHandlers: Set<(state: VoiceState) => void> = new Set();
  private participantHandlers: Set<(participants: VoiceParticipant[]) => void> = new Set();
  private speakingHandlers: Set<(publicKey: string, speaking: boolean) => void> = new Set();
  private audioAnalysers: Map<string, AnalyserNode> = new Map();
  private audioContext: AudioContext | null = null;
  private cleanupFns: Array<() => void> = [];
  private speakingAnimationFrames: Map<string, number> = new Map();
  // Queue for ICE candidates that arrive before remote description is set
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();

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
   * Join a voice channel via WebRTC mesh.
   */
  async join(channelId: string): Promise<void> {
    console.log("[MeshVoice] join() called for channel:", channelId.slice(0, 12), "current channel:", this.channelId?.slice(0, 12) ?? "none");
    
    if (this.channelId) {
      console.log("[MeshVoice] Already in a channel, calling leave() first");
      await this.leave();
    }

    this.state = { ...this.state, connecting: true, channelId };
    this.emitState();

    try {
      // 1. Get local microphone audio
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      // Set up audio analysis for local speaking detection
      this.audioContext = new AudioContext();
      this.setupSpeakingDetection(this.localStream, this.publicKey);

      this.channelId = channelId;
      const gun = GunInstanceManager.get();

      // Log Gun relay info for debugging
      // @ts-expect-error - accessing internal Gun property for debugging
      const peers = gun._.opt?.peers || {};
      console.log("[MeshVoice] Gun relay peers:", Object.keys(peers));

      // 2. Register as participant in Gun (clear leftAt to mark as active)
      console.log("[MeshVoice] Registering in channel:", channelId);
      gun
        .get("voice")
        .get(channelId)
        .get("participants")
        .get(this.publicKey)
        .put({
          publicKey: this.publicKey,
          joinedAt: Date.now(),
          leftAt: null, // Clear any previous leftAt
          heartbeat: Date.now(),
          muted: this.state.muted,
          deafened: this.state.deafened,
          speaking: false,
        });

      // 2b. Add self to local participants list
      this.participants.set(this.publicKey, {
        publicKey: this.publicKey,
        displayName: this.publicKey.slice(0, 8),
        muted: this.state.muted,
        deafened: this.state.deafened,
        speaking: false,
        serverMuted: false,
      });
      this.emitParticipants();

      // 3. First, read existing participants (once)
      console.log("[MeshVoice] Subscribing to participants at path: voice/" + channelId + "/participants");
      console.log("[MeshVoice] My public key:", this.publicKey.slice(0, 16) + "...");
      
      // Subscribe to participant changes (new joins/leaves/updates)
      // Capture channelId for this subscription to detect stale callbacks
      const subscribedChannelId = channelId;
      const participantRef = gun
        .get("voice")
        .get(channelId)
        .get("participants")
        .map();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      participantRef.on((data: any, key: string) => {
        // Guard: ignore events if we've switched channels or left
        if (this.channelId !== subscribedChannelId) {
          console.log("[MeshVoice] Ignoring stale participant event for old channel", subscribedChannelId.slice(0, 8));
          return;
        }
        
        console.log("[MeshVoice] Participant event:", key?.slice(0, 8), JSON.stringify(data));
        if (!key || key === "_") return;
        if (key === this.publicKey) {
          console.log("[MeshVoice] Skipping self");
          return; // Skip self (already added above)
        }

        // Check if participant has left (leftAt is set AND is newer than joinedAt)
        const hasLeft = data?.leftAt && (!data.joinedAt || data.leftAt > data.joinedAt);
        
        // Also consider stale participants (no heartbeat in last 30 seconds)
        const isStale = data?.heartbeat && (Date.now() - data.heartbeat > 30000);
        
        if (!data || hasLeft || isStale) {
          // Peer left or is stale — clean up their connection
          if (hasLeft) {
            console.log("[MeshVoice] Peer left:", key.slice(0, 8), "leftAt:", data?.leftAt, "joinedAt:", data?.joinedAt);
          } else if (isStale) {
            console.log("[MeshVoice] Removing stale peer:", key.slice(0, 8), "last heartbeat:", Math.round((Date.now() - data.heartbeat) / 1000), "s ago");
          }
          this.removePeer(key);
        } else if (!this.connections.has(key)) {
          // New peer — initiate connection (we are the offerer if our key is "greater")
          const isOfferer = this.publicKey > key;
          console.log("[MeshVoice] New peer detected:", key.slice(0, 8), isOfferer ? "(we offer)" : "(they offer)");
          this.connectToPeer(key, isOfferer);
          // Also add to participants
          this.participants.set(key, {
            publicKey: key,
            displayName: key.slice(0, 8),
            muted: data.muted ?? false,
            deafened: data.deafened ?? false,
            speaking: data.speaking ?? false,
            serverMuted: data.serverMuted ?? false,
          });
          this.emitParticipants();
        } else {
          // Existing peer updated state (mute/deafen/speaking)
          this.updatePeerState(key, data);
        }
      });

      this.cleanupFns.push(() => {
        console.log("[MeshVoice] Cleaning up participant subscription for", subscribedChannelId.slice(0, 8));
        participantRef.off();
      });

      // 4. Subscribe to signaling messages directed at us
      // Structure: voice/{channelId}/signaling/{toKey}/{fromKey}/{messageId}
      const signalingPath = `voice/${channelId}/signaling/${this.publicKey.slice(0, 8)}/*`;
      console.log(`[MeshVoice] Subscribing to signaling: ${signalingPath}`);
      
      // Track processed message IDs to avoid duplicates
      const processedMessages = new Set<string>();
      // Track which fromKeys we've already subscribed to
      const subscribedFromKeys = new Set<string>();
      // Only process messages newer than our join time (minus small buffer for clock skew)
      const joinTimestamp = Date.now() - 5000;
      
      // Subscribe to signaling messages from all peers
      const signalingBaseRef = gun
        .get("voice")
        .get(channelId)
        .get("signaling")
        .get(this.publicKey); // Messages TO us
      
      // For each fromKey, subscribe to their messages (only once per fromKey)
      const fromKeyRef = signalingBaseRef.map();
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fromKeyRef.on((fromKeyData: any, fromKey: string) => {
        if (!fromKeyData || !fromKey || fromKey === "_") return;
        
        // Only subscribe once per fromKey
        if (subscribedFromKeys.has(fromKey)) return;
        subscribedFromKeys.add(fromKey);
        
        console.log(`[MeshVoice] Setting up signaling subscription for peer ${fromKey.slice(0, 8)}`);
        
        // Subscribe to messages from this specific peer
        const peerMsgRef = signalingBaseRef.get(fromKey).map();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        peerMsgRef.on(async (msgData: any, messageId: string) => {
          // Guard: ignore events if we've switched channels or left
          if (this.channelId !== subscribedChannelId) {
            return;
          }
          
          if (!msgData || !messageId || messageId === "_") return;
          
          // Create unique key combining fromKey and messageId
          const uniqueKey = `${fromKey}:${messageId}`;
          if (processedMessages.has(uniqueKey)) return;
          processedMessages.add(uniqueKey);

          try {
            const signal = typeof msgData === "string" ? JSON.parse(msgData) : msgData;
            
            // Skip old messages from previous sessions
            if (signal.timestamp && signal.timestamp < joinTimestamp) {
              return; // Silently skip old messages
            }
            
            if (signal.type && signal.data) {
              console.log(`[MeshVoice] Processing ${signal.type} from ${fromKey.slice(0, 8)}`);
              await this.handleSignalingMessage(fromKey, signal);
            }
          } catch (e) {
            console.error("[MeshVoice] Error handling signaling:", e);
          }
        });
        
        // Add cleanup for this peer's subscription
        this.cleanupFns.push(() => peerMsgRef.off());
      });

      this.cleanupFns.push(() => {
        console.log("[MeshVoice] Cleaning up signaling subscription for", subscribedChannelId.slice(0, 8));
        fromKeyRef.off();
      });

      // 5. Start heartbeat to keep presence fresh (Gun can be unreliable)
      const heartbeatInterval = setInterval(() => {
        // Guard: only run if we're still in the same channel
        if (!this.channelId || this.channelId !== subscribedChannelId) return;
        
        gun
          .get("voice")
          .get(this.channelId)
          .get("participants")
          .get(this.publicKey)
          .put({
            heartbeat: Date.now(),
            muted: this.state.muted,
            deafened: this.state.deafened,
          });
      }, 5000); // Every 5 seconds

      this.cleanupFns.push(() => {
        console.log("[MeshVoice] Cleaning up heartbeat interval");
        clearInterval(heartbeatInterval);
      });

      // 6. Periodic peer discovery (Gun sync can be unreliable)
      const discoveryInterval = setInterval(() => {
        // Guard: only run if we're still in the same channel we started with
        if (!this.channelId || this.channelId !== subscribedChannelId) return;
        
        gun
          .get("voice")
          .get(this.channelId)
          .get("participants")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .once((participants: any) => {
            // Double-check we're still in the right channel when callback fires
            if (!this.channelId || this.channelId !== subscribedChannelId) return;
            if (!participants || typeof participants !== "object") return;
            
            for (const [key, data] of Object.entries(participants)) {
              if (!key || key === "_" || key === this.publicKey) continue;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const pData = data as any;
              if (!pData || !pData.joinedAt) continue;
              
              const hasLeft = pData.leftAt && pData.leftAt > pData.joinedAt;
              const isStale = pData.heartbeat && (Date.now() - pData.heartbeat > 30000);
              
              if (!hasLeft && !isStale && !this.connections.has(key)) {
                console.log("[MeshVoice] Discovery poll found peer:", key.slice(0, 8));
                const isOfferer = this.publicKey > key;
                this.connectToPeer(key, isOfferer);
                this.participants.set(key, {
                  publicKey: key,
                  displayName: key.slice(0, 8),
                  muted: pData.muted ?? false,
                  deafened: pData.deafened ?? false,
                  speaking: pData.speaking ?? false,
                  serverMuted: pData.serverMuted ?? false,
                });
                this.emitParticipants();
              }
            }
          });
      }, 3000); // Every 3 seconds

      this.cleanupFns.push(() => {
        console.log("[MeshVoice] Cleaning up discovery interval");
        clearInterval(discoveryInterval);
      });

      console.log("[MeshVoice] Joined channel:", channelId, "as", this.publicKey.slice(0, 8), "- subscribed to", subscribedChannelId.slice(0, 12));

      this.state = {
        ...this.state,
        connecting: false,
        tier: "mesh",
        channelId,
      };
      this.emitState();

    } catch (error) {
      this.state = { ...this.state, connecting: false, channelId: null };
      this.emitState();
      throw error;
    }
  }

  /**
   * Create a peer connection to another participant.
   */
  private async connectToPeer(peerKey: string, isOfferer: boolean): Promise<void> {
    // Avoid duplicate connections
    if (this.connections.has(peerKey)) return;

    const pc = new RTCPeerConnection({
      iceServers: [...VOICE_CONSTANTS.ICE_SERVERS],
    });

    this.connections.set(peerKey, pc);

    // Add our local audio tracks to the connection
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    // Handle incoming audio from this peer
    pc.ontrack = (event) => {
      console.log(`[MeshVoice] Received track from ${peerKey.slice(0, 8)}:`, event.track.kind);
      const remoteStream = event.streams[0];
      if (remoteStream) {
        console.log(`[MeshVoice] Playing audio from ${peerKey.slice(0, 8)}, tracks:`, remoteStream.getAudioTracks().length);
        this.playRemoteAudio(peerKey, remoteStream);
        this.setupSpeakingDetection(remoteStream, peerKey);
      } else {
        console.warn(`[MeshVoice] No stream in track event from ${peerKey.slice(0, 8)}`);
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignalingMessage(peerKey, {
          type: "candidate",
          data: JSON.stringify(event.candidate),
        });
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`[MeshVoice] Connection to ${peerKey.slice(0, 8)}: ${pc.connectionState}`);
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        console.warn(`[MeshVoice] Connection to ${peerKey.slice(0, 8)} ${pc.connectionState}`);
        // Don't auto-reconnect here - let the participant list drive reconnection
      } else if (pc.connectionState === "connected") {
        console.log(`[MeshVoice] Successfully connected to ${peerKey.slice(0, 8)}`);
      }
    };

    // If we're the offerer, create and send an SDP offer
    if (isOfferer) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        console.log(`[MeshVoice] Sending offer to ${peerKey.slice(0, 8)}`);
        this.sendSignalingMessage(peerKey, {
          type: "offer",
          data: JSON.stringify(offer),
        });
      } catch (e) {
        console.error("[MeshVoice] Error creating offer:", e);
      }
    }
  }

  /**
   * Handle an incoming signaling message (SDP offer, answer, or ICE candidate).
   */
  private async handleSignalingMessage(
    fromKey: string,
    signal: { type: string; data: string }
  ): Promise<void> {
    console.log(`[MeshVoice] Received ${signal.type} from ${fromKey.slice(0, 8)}`);

    if (signal.type === "offer") {
      // Someone is offering to connect to us
      console.log(`[MeshVoice] Processing offer - connection exists: ${this.connections.has(fromKey)}`);
      if (!this.connections.has(fromKey)) {
        await this.connectToPeer(fromKey, false);
      }

      const pc = this.connections.get(fromKey);
      if (!pc) {
        console.error("[MeshVoice] No peer connection for", fromKey.slice(0, 8));
        return;
      }
      
      console.log(`[MeshVoice] PC state: ${pc.connectionState}, signaling: ${pc.signalingState}`);
      
      // Skip if we've already completed the handshake
      if (pc.signalingState === "stable" && pc.connectionState !== "new") {
        console.log("[MeshVoice] Skipping offer - already have stable connection");
        return;
      }

      try {
        const offer = JSON.parse(signal.data);
        console.log("[MeshVoice] Setting remote description (offer)");
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        console.log("[MeshVoice] Remote description set successfully");

        // Process any queued ICE candidates now that remote description is set
        await this.processPendingCandidates(fromKey, pc);

        console.log("[MeshVoice] Creating answer");
        const answer = await pc.createAnswer();
        console.log("[MeshVoice] Setting local description (answer)");
        await pc.setLocalDescription(answer);

        console.log(`[MeshVoice] Sending answer to ${fromKey.slice(0, 8)}`);
        this.sendSignalingMessage(fromKey, {
          type: "answer",
          data: JSON.stringify(answer),
        });
      } catch (e) {
        console.error("[MeshVoice] Error handling offer:", e);
      }

    } else if (signal.type === "answer") {
      const pc = this.connections.get(fromKey);
      if (!pc) return;

      try {
        const answer = JSON.parse(signal.data);
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`[MeshVoice] Answer processed from ${fromKey.slice(0, 8)}`);

        // Process any queued ICE candidates now that remote description is set
        await this.processPendingCandidates(fromKey, pc);
      } catch (e) {
        console.error("[MeshVoice] Error handling answer:", e);
      }

    } else if (signal.type === "candidate") {
      const pc = this.connections.get(fromKey);
      if (!pc) return;

      try {
        const candidate = JSON.parse(signal.data);
        
        // If remote description isn't set yet, queue the candidate
        if (!pc.remoteDescription) {
          console.log(`[MeshVoice] Queuing ICE candidate from ${fromKey.slice(0, 8)} (no remote description yet)`);
          const pending = this.pendingCandidates.get(fromKey) || [];
          pending.push(candidate);
          this.pendingCandidates.set(fromKey, pending);
          return;
        }
        
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error("[MeshVoice] Error handling ICE candidate:", e);
      }
    }
  }

  /**
   * Process queued ICE candidates for a peer after remote description is set.
   */
  private async processPendingCandidates(peerKey: string, pc: RTCPeerConnection): Promise<void> {
    const pending = this.pendingCandidates.get(peerKey);
    if (!pending || pending.length === 0) return;

    console.log(`[MeshVoice] Processing ${pending.length} queued ICE candidates for ${peerKey.slice(0, 8)}`);
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error(`[MeshVoice] Error adding queued candidate:`, e);
      }
    }
    this.pendingCandidates.delete(peerKey);
  }

  /**
   * Send a signaling message to a peer via the Gun graph.
   */
  private sendSignalingMessage(
    toKey: string,
    signal: { type: string; data: string }
  ): void {
    if (!this.channelId) return;

    const gun = GunInstanceManager.get();
    const messageId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const path = `voice/${this.channelId}/signaling/${toKey.slice(0, 8)}/${this.publicKey.slice(0, 8)}/${messageId}`;
    console.log(`[MeshVoice] Sending ${signal.type} via Gun: ${path}`);

    // Write to: voice/{channelId}/signaling/{toKey}/{fromKey}/{messageId}
    // Using unique messageId so each message is preserved (not overwritten)
    gun
      .get("voice")
      .get(this.channelId)
      .get("signaling")
      .get(toKey)
      .get(this.publicKey)
      .get(messageId)
      .put(JSON.stringify({ ...signal, from: this.publicKey, timestamp: Date.now() }));
  }

  /**
   * Play remote audio from a peer.
   */
  private playRemoteAudio(peerKey: string, stream: MediaStream): void {
    // Remove existing audio element if any
    const existingEl = document.getElementById(`voice-audio-${peerKey}`);
    if (existingEl) existingEl.remove();

    const audio = document.createElement("audio");
    audio.id = `voice-audio-${peerKey}`;
    audio.srcObject = stream;
    audio.autoplay = true;
    // playsInline is valid but not in TS types
    (audio as HTMLAudioElement & { playsInline: boolean }).playsInline = true;
    audio.style.display = "none";

    // Respect deafen state
    audio.muted = this.state.deafened;

    document.body.appendChild(audio);

    // Explicitly call play() to handle autoplay restrictions
    audio.play()
      .then(() => {
        console.log(`[MeshVoice] Audio playing from ${peerKey.slice(0, 8)}`);
      })
      .catch((err) => {
        console.error(`[MeshVoice] Audio play failed for ${peerKey.slice(0, 8)}:`, err);
        // If autoplay blocked, try again on user interaction
        const playOnInteraction = () => {
          audio.play().catch(console.error);
          document.removeEventListener("click", playOnInteraction);
        };
        document.addEventListener("click", playOnInteraction, { once: true });
      });
  }

  /**
   * Set up audio level analysis for speaking detection.
   * Uses time-domain analysis for more accurate voice detection.
   */
  private setupSpeakingDetection(stream: MediaStream, key: string): void {
    if (!this.audioContext) return;

    const source = this.audioContext.createMediaStreamSource(stream);
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.5; // More smoothing to reduce noise
    source.connect(analyser);

    this.audioAnalysers.set(key, analyser);

    // Use time-domain data for volume detection (more accurate than frequency)
    const dataArray = new Float32Array(analyser.fftSize);
    let lastSpeakingState = false;
    let lastEmittedState = false;
    let debounceTimeout: number | null = null;
    let logCounter = 0;
    
    // Single threshold - simpler and more reliable
    // -40dB is more sensitive to quieter speech
    const SPEAKING_THRESHOLD = -40; // dB threshold for speaking detection

    const checkSpeaking = () => {
      if (!this.channelId) return; // Stop if disconnected
      
      // Don't detect speaking for local user when muted
      if (key === this.publicKey && this.state.muted) {
        if (lastEmittedState) {
          lastSpeakingState = false;
          lastEmittedState = false;
          if (debounceTimeout) {
            clearTimeout(debounceTimeout);
            debounceTimeout = null;
          }
          const participant = this.participants.get(key);
          if (participant) {
            participant.speaking = false;
            this.emitParticipants();
          }
          this.state = { ...this.state, speaking: false };
          this.emitState();
          this.emitSpeaking(key, false);
        }
        const frameId = requestAnimationFrame(checkSpeaking);
        this.speakingAnimationFrames.set(key, frameId);
        return;
      }

      // Get raw waveform data
      analyser.getFloatTimeDomainData(dataArray);
      
      // Calculate RMS (root mean square) for accurate volume
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sumSquares += dataArray[i] * dataArray[i];
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      
      // Convert to decibels
      const db = 20 * Math.log10(Math.max(rms, 0.00001));
      const isSpeaking = db > SPEAKING_THRESHOLD;
      
      // Debug logging every 60 frames (~1 second)
      logCounter++;
      if (logCounter % 60 === 0) {
        console.log(`[Speaking] ${key.slice(0, 8)}: db=${db.toFixed(1)}, speaking=${isSpeaking}, emitted=${lastEmittedState}`);
      }
      
      // Detect if instant state just flipped
      const stateJustFlipped = isSpeaking !== lastSpeakingState;
      lastSpeakingState = isSpeaking;

      // Only reset the timer when the instant state FLIPS (not every frame)
      if (stateJustFlipped && debounceTimeout) {
        clearTimeout(debounceTimeout);
        debounceTimeout = null;
      }

      // Schedule emission if state differs from emitted and no timeout pending
      if (lastSpeakingState !== lastEmittedState && debounceTimeout === null) {
        debounceTimeout = window.setTimeout(() => {
          debounceTimeout = null;
          // Re-check if state is still different (prevents stale updates)
          if (lastSpeakingState !== lastEmittedState) {
            console.log(`[Speaking] ${key.slice(0, 8)}: EMITTING ${lastSpeakingState} (was ${lastEmittedState})`);
            lastEmittedState = lastSpeakingState;

            // Update local participant speaking state
            const participant = this.participants.get(key);
            if (participant) {
              participant.speaking = lastEmittedState;
              this.emitParticipants();
            }

            if (key === this.publicKey) {
              this.state = { ...this.state, speaking: lastEmittedState };
              this.emitState();

              // Update speaking state in Gun for other peers to see
              if (this.channelId) {
                const gun = GunInstanceManager.get();
                gun
                  .get("voice")
                  .get(this.channelId)
                  .get("participants")
                  .get(this.publicKey)
                  .put({ speaking: lastEmittedState });
              }
            }

            this.emitSpeaking(key, lastEmittedState);
          }
        }, VOICE_CONSTANTS.SPEAKING_DEBOUNCE_MS);
      }

      const frameId = requestAnimationFrame(checkSpeaking);
      this.speakingAnimationFrames.set(key, frameId);
    };

    const frameId = requestAnimationFrame(checkSpeaking);
    this.speakingAnimationFrames.set(key, frameId);
  }

  /**
   * Leave the current voice channel.
   */
  async leave(): Promise<void> {
    if (!this.channelId) {
      console.log("[MeshVoice] leave() called but no channelId, skipping");
      return;
    }

    console.log("[MeshVoice] Leaving channel:", this.channelId.slice(0, 12), "cleanup functions:", this.cleanupFns.length);

    const gun = GunInstanceManager.get();
    const channelId = this.channelId;

    // IMPORTANT: Set channelId to null FIRST to prevent race conditions
    // where cleanup callbacks fire after we've started setting up new subscriptions
    this.channelId = null;

    // Mark as left in Gun
    gun
      .get("voice")
      .get(channelId)
      .get("participants")
      .get(this.publicKey)
      .put({ leftAt: Date.now() });

    // Close all peer connections
    for (const [key, pc] of this.connections) {
      pc.close();
      // Remove audio elements
      const audioEl = document.getElementById(`voice-audio-${key}`);
      if (audioEl) audioEl.remove();
    }
    this.connections.clear();

    // Clear pending ICE candidates
    this.pendingCandidates.clear();

    // Cancel speaking animation frames
    for (const frameId of this.speakingAnimationFrames.values()) {
      cancelAnimationFrame(frameId);
    }
    this.speakingAnimationFrames.clear();

    // Stop local audio stream
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        track.stop();
      }
      this.localStream = null;
    }

    // Close audio context
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
    }
    this.audioAnalysers.clear();

    // Run cleanup functions (Gun unsubscribes)
    console.log("[MeshVoice] Running", this.cleanupFns.length, "cleanup functions");
    for (const fn of this.cleanupFns) {
      fn();
    }
    this.cleanupFns = [];

    this.participants.clear();
    // channelId already set to null at start of leave()

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

  /**
   * Toggle self-mute.
   */
  async setMuted(muted: boolean): Promise<void> {
    this.state = { ...this.state, muted };

    // Mute/unmute the local audio track
    if (this.localStream) {
      for (const track of this.localStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }

    // Update local self-participant
    const self = this.participants.get(this.publicKey);
    if (self) {
      self.muted = muted;
      this.emitParticipants();
    }

    // Update state in Gun
    if (this.channelId) {
      const gun = GunInstanceManager.get();
      gun
        .get("voice")
        .get(this.channelId)
        .get("participants")
        .get(this.publicKey)
        .put({ muted });
    }

    this.emitState();
  }

  /**
   * Toggle self-deafen (mutes all incoming audio).
   */
  async setDeafened(deafened: boolean): Promise<void> {
    this.state = { ...this.state, deafened };

    // Also mute self when deafening (Discord behavior)
    if (deafened && !this.state.muted) {
      await this.setMuted(true);
    }

    // Update local self-participant
    const self = this.participants.get(this.publicKey);
    if (self) {
      self.deafened = deafened;
      this.emitParticipants();
    }

    // Mute/unmute all remote audio elements
    for (const [key] of this.connections) {
      const audioEl = document.getElementById(`voice-audio-${key}`) as HTMLAudioElement;
      if (audioEl) {
        audioEl.muted = deafened;
      }
    }

    // Update state in Gun
    if (this.channelId) {
      const gun = GunInstanceManager.get();
      gun
        .get("voice")
        .get(this.channelId)
        .get("participants")
        .get(this.publicKey)
        .put({ deafened });
    }

    this.emitState();
  }

  // ── Helper methods ──

  private removePeer(key: string): void {
    const pc = this.connections.get(key);
    if (pc) {
      pc.close();
      this.connections.delete(key);
    }

    // Clear any pending ICE candidates for this peer
    this.pendingCandidates.delete(key);

    // Cancel animation frame for speaking detection
    const frameId = this.speakingAnimationFrames.get(key);
    if (frameId) {
      cancelAnimationFrame(frameId);
      this.speakingAnimationFrames.delete(key);
    }

    const audioEl = document.getElementById(`voice-audio-${key}`);
    if (audioEl) audioEl.remove();
    this.audioAnalysers.delete(key);
    this.participants.delete(key);
    this.emitParticipants();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private updatePeerState(key: string, data: any): void {
    const existing = this.participants.get(key);
    if (existing) {
      existing.muted = data.muted ?? existing.muted;
      existing.deafened = data.deafened ?? existing.deafened;
      existing.speaking = data.speaking ?? existing.speaking;
      existing.serverMuted = data.serverMuted ?? existing.serverMuted;
      this.emitParticipants();
    }
  }

  private emitState(): void {
    for (const handler of this.stateHandlers) {
      handler(this.state);
    }
  }

  private emitParticipants(): void {
    const list = Array.from(this.participants.values());
    for (const handler of this.participantHandlers) {
      handler(list);
    }
  }

  private emitSpeaking(key: string, speaking: boolean): void {
    for (const handler of this.speakingHandlers) {
      handler(key, speaking);
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
    if (!this.localStream) return;

    // Stop existing tracks
    for (const track of this.localStream.getAudioTracks()) {
      track.stop();
    }

    // Get new audio stream with specified device
    const newStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    });

    this.localStream = newStream;

    // Replace track in all peer connections
    const newTrack = newStream.getAudioTracks()[0];
    for (const pc of this.connections.values()) {
      const sender = pc.getSenders().find(s => s.track?.kind === "audio");
      if (sender) {
        await sender.replaceTrack(newTrack);
      }
    }

    // Re-setup speaking detection
    if (this.audioContext) {
      this.setupSpeakingDetection(newStream, this.publicKey);
    }
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    // Set sinkId on all audio elements
    for (const [key] of this.connections) {
      const audioEl = document.getElementById(`voice-audio-${key}`) as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (audioEl && audioEl.setSinkId) {
        try {
          await audioEl.setSinkId(deviceId);
        } catch (e) {
          console.warn(`[MeshVoice] Could not set output device for ${key}:`, e);
        }
      }
    }
  }
}
