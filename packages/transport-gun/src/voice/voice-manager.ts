import { MeshVoiceTransport } from "./mesh-voice-transport";
import { LiveKitVoiceTransport } from "./livekit-voice-transport";
import type { IVoiceTransport, Unsubscribe } from "@nodes/transport";
import type { VoiceState, VoiceParticipant, NodeVoiceConfig } from "@nodes/core";
import { VOICE_CONSTANTS } from "@nodes/core";
import { GunInstanceManager } from "../gun-instance";

/**
 * VoiceManager decides which voice tier to use and delegates accordingly.
 *
 * Tier decision:
 * - If room has ≤ MESH_MAX_PARTICIPANTS → MeshVoiceTransport (P2P)
 * - If room has > MESH_MAX_PARTICIPANTS → LiveKitVoiceTransport (SFU)
 * - If Node has no LiveKit config and room exceeds mesh limit → stay on mesh with warning
 *
 * The VoiceManager also handles:
 * - Announcing voice state in the Gun graph (for sidebar presence)
 * - Clean disconnection on app close
 * - Tier migration (mesh → LiveKit when room grows)
 */
export class VoiceManager implements IVoiceTransport {
  private meshTransport: MeshVoiceTransport;
  private livekitTransport: LiveKitVoiceTransport;
  private activeTier: "mesh" | "livekit" | null = null;
  private publicKey: string;
  private nodeVoiceConfig: NodeVoiceConfig | null = null;
  private currentChannelId: string | null = null;
  /**
   * When true (default), prefer routing through LiveKit SFU regardless of
   * participant count to hide participant IP addresses from each other.
   * May fall back to P2P mesh if no SFU is configured or the SFU join fails.
   * Set via {@link setPreferSfu}.
   */
  private preferSfu: boolean = true;

  constructor(publicKey: string) {
    this.publicKey = publicKey;
    this.meshTransport = new MeshVoiceTransport(publicKey);
    this.livekitTransport = new LiveKitVoiceTransport(publicKey);
  }

  /**
   * Set the voice configuration for the current Node.
   * Called when switching Nodes or when the config changes.
   */
  setNodeConfig(config: NodeVoiceConfig): void {
    this.nodeVoiceConfig = config;
  }

  /**
   * Set the user's privacy preference for voice routing.
   *
   * - `true` (default): Prefer SFU for all rooms regardless of size to hide
   *   participant IPs from each other. Falls back to P2P mesh (exposing IPs)
   *   if no SFU is configured for the Node or the SFU join fails.
   * - `false`: Allow P2P mesh for small rooms (lower latency, exposes IPs).
   *   Rooms that exceed the mesh size limit still escalate to SFU when
   *   available.
   *
   * Takes effect on next `join()`. Does not affect an in-progress call.
   */
  setPreferSfu(prefer: boolean): void {
    this.preferSfu = prefer;
  }

  async join(channelId: string, _nodeId: string): Promise<void> {
    const hasSfuConfig = Boolean(
      this.nodeVoiceConfig?.livekitUrl || this.nodeVoiceConfig?.useDefaultServer
    );

    // Determine desired tier.
    //
    // If preferSfu is true (the default), we always want SFU regardless of
    // room size. This is the common path and skipping the participant-count
    // probe avoids ~300ms of unnecessary latency on join.
    //
    // Otherwise we need the count to know whether the room has grown past
    // the mesh limit and must be pushed to SFU for quality reasons.
    let participantCount = 0;
    let wantSfu: boolean;
    if (this.preferSfu) {
      wantSfu = true;
    } else {
      participantCount = await this.getParticipantCount(channelId);
      wantSfu = participantCount >= VOICE_CONSTANTS.MESH_MAX_PARTICIPANTS;
    }

    if (wantSfu && hasSfuConfig) {
      // Attempt LiveKit (SFU). If token generation or the transport join
      // fails, fall through to mesh below rather than leaving the manager
      // in an inconsistent state or dropping the user with no voice.
      const serverUrl =
        this.nodeVoiceConfig?.livekitUrl ?? "wss://default-voice.nodes.chat";
      try {
        const token = await this.generateLiveKitToken(channelId, _nodeId);
        await this.livekitTransport.join(channelId, serverUrl, token);
        this.activeTier = "livekit";
        this.currentChannelId = channelId;
        return;
      } catch (err) {
        console.warn(
          "[VoiceManager] LiveKit SFU join failed, falling back to P2P mesh. " +
            (this.preferSfu
              ? "Your IP will be visible to other participants."
              : "Voice quality may degrade in large rooms."),
          err
        );
      }
    } else if (wantSfu && !hasSfuConfig) {
      // No LiveKit server is configured for this Node. Fall back to mesh,
      // but the warning message depends on WHY we wanted SFU in the first place:
      // - If the user opted into SFU-first for privacy, this fallback re-exposes
      //   their IP - a security concern they should know about.
      // - If SFU was forced by room size (>= MESH_MAX_PARTICIPANTS), this is
      //   the pre-existing quality-degradation path with no privacy regression.
      if (this.preferSfu) {
        console.warn(
          "[VoiceManager] SFU preferred for privacy but no LiveKit server is configured for this Node. " +
            "Falling back to P2P mesh \u2014 your IP will be visible to other participants."
        );
      } else {
        // participantCount from getParticipantCount() excludes the local user;
        // add 1 so the log matches the total room size the user will see.
        const totalWithSelf = participantCount + 1;
        console.warn(
          `[VoiceManager] Room will have ${totalWithSelf} users (limit ${VOICE_CONSTANTS.MESH_MAX_PARTICIPANTS} for P2P mesh) ` +
            "and no LiveKit server is configured. Using P2P mesh anyway; voice quality may degrade."
        );
      }
    }

    // Use mesh (P2P)
    await this.meshTransport.join(channelId);
    this.activeTier = "mesh";
    this.currentChannelId = channelId;
  }

  async leave(): Promise<void> {
    if (this.activeTier === "mesh") {
      await this.meshTransport.leave();
    } else if (this.activeTier === "livekit") {
      await this.livekitTransport.leave();
    }
    this.activeTier = null;
    this.currentChannelId = null;
  }

  async setMuted(muted: boolean): Promise<void> {
    if (this.activeTier === "mesh") {
      await this.meshTransport.setMuted(muted);
    } else if (this.activeTier === "livekit") {
      await this.livekitTransport.setMuted(muted);
    }
  }

  async setDeafened(deafened: boolean): Promise<void> {
    if (this.activeTier === "mesh") {
      await this.meshTransport.setDeafened(deafened);
    } else if (this.activeTier === "livekit") {
      await this.livekitTransport.setDeafened(deafened);
    }
  }

  async serverMute(targetPublicKey: string, muted: boolean): Promise<void> {
    // Write server-mute to Gun (both tiers read this)
    const gun = GunInstanceManager.get();
    const channelId = this.getState().channelId;
    if (channelId) {
      gun
        .get("voice")
        .get(channelId)
        .get("participants")
        .get(targetPublicKey)
        .put({ serverMuted: muted });
    }
  }

  async disconnectUser(targetPublicKey: string): Promise<void> {
    // Write a disconnect signal to Gun
    const gun = GunInstanceManager.get();
    const channelId = this.getState().channelId;
    if (channelId) {
      gun
        .get("voice")
        .get(channelId)
        .get("kick")
        .get(targetPublicKey)
        .put({ kickedAt: Date.now(), kickedBy: this.publicKey });
    }
  }

  async setInputDevice(deviceId: string): Promise<void> {
    if (this.activeTier === "mesh") {
      await this.meshTransport.setInputDevice(deviceId);
    } else if (this.activeTier === "livekit") {
      await this.livekitTransport.setInputDevice(deviceId);
    }
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    if (this.activeTier === "mesh") {
      await this.meshTransport.setOutputDevice(deviceId);
    } else if (this.activeTier === "livekit") {
      await this.livekitTransport.setOutputDevice(deviceId);
    }
  }

  getState(): VoiceState {
    if (this.activeTier === "mesh") {
      return this.meshTransport.getState();
    }
    if (this.activeTier === "livekit") {
      return this.livekitTransport.getState();
    }
    return {
      channelId: null,
      tier: null,
      muted: false,
      deafened: false,
      speaking: false,
      connecting: false,
    };
  }

  onStateChange(handler: (state: VoiceState) => void): Unsubscribe {
    const unsub1 = this.meshTransport.onStateChange(handler);
    const unsub2 = this.livekitTransport.onStateChange(handler);
    return () => {
      unsub1();
      unsub2();
    };
  }

  onParticipantsChange(handler: (participants: VoiceParticipant[]) => void): Unsubscribe {
    const unsub1 = this.meshTransport.onParticipantsChange(handler);
    const unsub2 = this.livekitTransport.onParticipantsChange(handler);
    return () => {
      unsub1();
      unsub2();
    };
  }

  onSpeakingChange(handler: (publicKey: string, speaking: boolean) => void): Unsubscribe {
    const unsub1 = this.meshTransport.onSpeakingChange(handler);
    const unsub2 = this.livekitTransport.onSpeakingChange(handler);
    return () => {
      unsub1();
      unsub2();
    };
  }

  // ── Private helpers ──

  private async getParticipantCount(channelId: string): Promise<number> {
    return new Promise((resolve) => {
      let count = 0;
      const gun = GunInstanceManager.get();
      const ref = gun
        .get("voice")
        .get(channelId)
        .get("participants")
        .map();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref.once((data: any, key: string) => {
        if (data && data !== null && !data.leftAt && key !== "_") {
          count++;
        }
      });

      // Give Gun some time to collect participants
      setTimeout(() => {
        ref.off();
        resolve(count);
      }, 300);
    });
  }

  private async generateLiveKitToken(
    channelId: string,
    nodeId: string
  ): Promise<string> {
    // For alpha: This is a placeholder.
    // In production, this would either:
    // 1. Call a token service endpoint
    // 2. Generate client-side using livekit-server-sdk (requires API secret exposure)
    //
    // For self-hosted Nodes, the Node owner configures their LiveKit API key/secret
    // and tokens are generated client-side. This is acceptable because all users
    // are trusted community members and the Node owner controls the infrastructure.

    if (!this.nodeVoiceConfig?.livekitApiKey || !this.nodeVoiceConfig?.livekitApiSecret) {
      throw new Error(
        "LiveKit API key and secret must be configured in Node settings to use SFU mode."
      );
    }

    // Room name format: nodeId_channelId
    const roomName = `${nodeId}_${channelId}`;

    // For now, throw an error indicating token generation isn't implemented
    // In a real implementation, you'd use livekit-server-sdk or a JWT library:
    //
    // import { AccessToken } from "livekit-server-sdk";
    // const token = new AccessToken(apiKey, apiSecret, { identity: this.publicKey });
    // token.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true });
    // return token.toJwt();

    // Placeholder - will be implemented with proper token generation
    console.warn(
      `[VoiceManager] Token generation not yet implemented for room ${roomName}. ` +
        "Falling back to mesh mode."
    );
    throw new Error("LiveKit token generation requires server-side implementation.");
  }
}
