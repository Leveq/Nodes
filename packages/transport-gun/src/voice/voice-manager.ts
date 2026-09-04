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
   * When true (default, "privacy mode"), route through the LiveKit SFU
   * regardless of participant count so participant IPs stay hidden from
   * each other. Fails closed if no SFU is configured or the SFU join
   * fails, rather than silently exposing IPs by falling back to mesh.
   * When false, use size-based routing (mesh below the participant limit,
   * SFU above it, with mesh as a quality-warned fallback).
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
   * - `true` (default, "privacy mode"): Route through the SFU for all rooms
   *   regardless of size to hide participant IPs from each other. Fails
   *   closed on join if no SFU is configured or the SFU join fails; does
   *   NOT fall back to P2P mesh, because that would expose the user's IP
   *   after the UI told them the SFU would protect it.
   * - `false`: Allow P2P mesh for small rooms (lower latency, exposes IPs).
   *   Rooms that exceed the mesh size limit escalate to SFU when available,
   *   or fall back to mesh with a quality warning if no SFU is configured.
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

    // Two distinct routing modes:
    //
    // 1. preferSfu = true (default, "privacy mode"): the user has been told in
    //    the UI that voice will route through the SFU so their IP stays hidden
    //    from other participants. We MUST NOT silently fall back to P2P mesh
    //    here \u2014 that would expose their IP without prior consent, defeating
    //    the whole point of the preference. So we fail closed: if the SFU is
    //    unavailable or the join fails, throw and let the caller surface an
    //    actionable error to the user.
    //
    // 2. preferSfu = false: the user explicitly opted into P2P mesh for lower
    //    latency in small rooms and accepted the IP-exposure tradeoff. We
    //    keep the pre-existing size-based routing (mesh below the participant
    //    limit, SFU above it) and fall back to mesh when SFU is unavailable,
    //    since mesh is already an acceptable outcome for this user.
    if (this.preferSfu) {
      if (!hasSfuConfig) {
        throw new Error(
          "Voice privacy mode requires an SFU, but this Node has no LiveKit server configured. " +
            "Ask the Node owner to configure LiveKit, or disable \u201CAlways use server\u201D " +
            "in Settings \u2192 Voice \u2192 Voice Privacy to allow P2P mesh."
        );
      }

      const serverUrl =
        this.nodeVoiceConfig?.livekitUrl ?? "wss://default-voice.nodes.chat";
      this.activeTier = "livekit";
      this.currentChannelId = channelId;
      try {
        const token = await this.generateLiveKitToken(channelId, _nodeId);
        await this.livekitTransport.join(channelId, serverUrl, token);
        return;
      } catch (err) {
        // Best-effort cleanup in case room.connect() succeeded but a later
        // step (track publish, mic permission, token accept, etc.) threw.
        try {
          await this.livekitTransport.leave();
        } catch {
          /* ignore \u2014 already in error path */
        }
        this.activeTier = null;
        this.currentChannelId = null;
        throw new Error(
          "Voice privacy mode is enabled but the SFU join failed. " +
            "Not falling back to P2P mesh because that would expose your IP. " +
            "Disable \u201CAlways use server\u201D in Settings \u2192 Voice \u2192 Voice Privacy " +
            "if you accept that risk.",
          { cause: err }
        );
      }
    }

    // preferSfu = false. Size-based routing with mesh as an acceptable fallback.
    const participantCount = await this.getParticipantCount(channelId);
    const wantSfu = participantCount >= VOICE_CONSTANTS.MESH_MAX_PARTICIPANTS;

    if (wantSfu && hasSfuConfig) {
      const serverUrl =
        this.nodeVoiceConfig?.livekitUrl ?? "wss://default-voice.nodes.chat";
      this.activeTier = "livekit";
      this.currentChannelId = channelId;
      try {
        const token = await this.generateLiveKitToken(channelId, _nodeId);
        await this.livekitTransport.join(channelId, serverUrl, token);
        return;
      } catch (err) {
        console.warn(
          "[VoiceManager] LiveKit SFU join failed, falling back to P2P mesh. " +
            "Voice quality may degrade in large rooms.",
          err
        );
        try {
          await this.livekitTransport.leave();
        } catch {
          /* ignore */
        }
        this.activeTier = null;
        this.currentChannelId = null;
      }
    } else if (wantSfu && !hasSfuConfig) {
      // Large room but no SFU configured. participantCount from
      // getParticipantCount() excludes the local user; add 1 so the log
      // matches the total room size the user will see.
      const totalWithSelf = participantCount + 1;
      console.warn(
        `[VoiceManager] Room will have ${totalWithSelf} users (limit ${VOICE_CONSTANTS.MESH_MAX_PARTICIPANTS} for P2P mesh) ` +
          "and no LiveKit server is configured. Using P2P mesh anyway; voice quality may degrade."
      );
    }

    // Use mesh (P2P). Set tier before awaiting so mute/deafen/leave route
    // correctly during the connecting phase. If the mesh join itself throws,
    // clear state and re-raise so the caller sees the real failure instead
    // of a phantom-connected session.
    this.activeTier = "mesh";
    this.currentChannelId = channelId;
    try {
      await this.meshTransport.join(channelId);
    } catch (err) {
      this.activeTier = null;
      this.currentChannelId = null;
      throw err;
    }
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
    _channelId: string,
    _nodeId: string
  ): Promise<string> {
    // Token generation is intentionally NOT implemented client-side.
    //
    // A previous iteration of this method minted HS256 JWTs directly in the
    // client using the Node's LiveKit API secret. That approach is unsafe:
    // distributing the API secret to every Node member means any member can
    // mint tokens for arbitrary identities, rooms, and grants \u2014 the SFU
    // has no way to distinguish a legitimate participant from a malicious
    // one. Encrypting the secret at rest does not help, because the client
    // needs the plaintext to sign.
    //
    // The correct design is a trusted token endpoint (either the community's
    // default server or a Node-provided endpoint) that:
    //   1. authenticates the caller (e.g., via a signed Gun-graph challenge),
    //   2. validates that the caller is allowed to join the requested room,
    //   3. returns a short-lived, identity- and room-scoped token.
    //
    // Until that endpoint exists, SFU joins fail closed \u2014 which for users
    // with preferSfu=true (the default) is surfaced by join() as a hard
    // error rather than a silent mesh fallback that would expose their IP.
    // Tracked in the follow-up issue.
    throw new Error(
      "SFU token endpoint not implemented. Nodes does not mint LiveKit tokens client-side because that would require distributing the API secret to every member."
    );
  }
}
