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
      // fails, defensively tear down any partial LiveKit session and fall
      // through to mesh below rather than leaving the manager in an
      // inconsistent state or dropping the user with no voice.
      //
      // We set activeTier/currentChannelId BEFORE awaiting so that user
      // actions during the connecting phase (mute, deafen, leave) route
      // to the right transport. On failure we reset them and let the
      // mesh fallback path own the final state.
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
            (this.preferSfu
              ? "Your IP will be visible to other participants."
              : "Voice quality may degrade in large rooms."),
          err
        );
        // Best-effort cleanup: if room.connect() succeeded but a later step
        // (track publish, mic permission, etc.) threw, the underlying Room
        // may still be alive. Ignore errors here — we're already in an
        // error path and about to hand control to the mesh transport.
        try {
          await this.livekitTransport.leave();
        } catch {
          /* ignore */
        }
        this.activeTier = null;
        this.currentChannelId = null;
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
            "Falling back to P2P mesh \u2014 your IP will be visible to other participants " +
            "and voice quality may degrade in large rooms."
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

    // Use mesh (P2P). Set tier before awaiting so mute/deafen/leave
    // route correctly during the connecting phase. If the mesh join
    // itself throws, clear state and re-raise so the caller sees the
    // real failure instead of a phantom-connected session.
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
    channelId: string,
    nodeId: string
  ): Promise<string> {
    // For self-hosted Nodes the Node owner configures the LiveKit API key and
    // secret in NodeVoiceConfig, and tokens are minted client-side. This is
    // the trust model documented in SECURITY.md: the Node owner controls the
    // infrastructure and all users of that Node have access to the secret in
    // the client bundle. If you're running a Node with untrusted users, you
    // must run a server-side token endpoint instead and set `useDefaultServer`.
    const apiKey = this.nodeVoiceConfig?.livekitApiKey;
    const apiSecret = this.nodeVoiceConfig?.livekitApiSecret;
    if (!apiKey || !apiSecret) {
      throw new Error(
        "LiveKit API key and secret must be configured in Node settings to use SFU mode."
      );
    }

    // Room name format: nodeId_channelId (matches the room the SFU expects).
    const roomName = `${nodeId}_${channelId}`;
    const now = Math.floor(Date.now() / 1000);
    const ttlSeconds = 6 * 60 * 60; // 6h; a rejoin refreshes.

    // LiveKit uses a standard JWT (HS256) with a `video` grant. See
    // https://docs.livekit.io/home/get-started/authentication/ for the shape.
    const header = { alg: "HS256", typ: "JWT" };
    const payload = {
      iss: apiKey,
      sub: this.publicKey,
      nbf: now,
      exp: now + ttlSeconds,
      name: this.publicKey,
      video: {
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      },
    };

    const enc = new TextEncoder();
    const b64url = (bytes: Uint8Array): string => {
      let str = "";
      for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
      return btoa(str)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
    };
    const b64urlJson = (obj: unknown): string =>
      b64url(enc.encode(JSON.stringify(obj)));

    const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
    const key = await crypto.subtle.importKey(
      "raw",
      enc.encode(apiSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, enc.encode(signingInput))
    );
    return `${signingInput}.${b64url(sig)}`;
  }
}
