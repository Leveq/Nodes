import { useState, useEffect, useRef, useMemo } from "react";
import { GunInstanceManager } from "@nodes/transport-gun";
import type { VoiceParticipant } from "@nodes/core";
import { useTransport } from "../providers/TransportProvider";

/** How often to poll the SFU presence endpoint for room occupancy. */
const PRESENCE_POLL_MS = 8000;

/**
 * Hook to observe who is in a voice channel WITHOUT joining it.
 *
 * SFU rooms (privacy mode) publish NO presence to the world-readable Gun graph;
 * their occupancy is polled live from the SFU presence endpoint. Mesh rooms
 * still use the Gun presence path. Both sources are merged (a channel only ever
 * uses one tier at a time), and this hook never WRITES to Gun.
 */
export function useVoiceChannelParticipants(channelId: string) {
  const { voice } = useTransport();
  const [sfuParticipants, setSfuParticipants] = useState<VoiceParticipant[]>([]);
  const [meshParticipants, setMeshParticipants] = useState<VoiceParticipant[]>([]);
  const meshRef = useRef<Map<string, VoiceParticipant>>(new Map());

  const useSfuPresence = Boolean(voice?.hasSfuPresence());

  // ── SFU presence: poll the endpoint (private, off-graph) ──
  useEffect(() => {
    if (!channelId || !useSfuPresence || !voice) {
      setSfuParticipants([]);
      return;
    }

    let active = true;
    const poll = async () => {
      try {
        const list = await voice.getRoomPresence(channelId);
        if (active && list) setSfuParticipants(list);
      } catch {
        // Transient failure — keep the last known list.
      }
    };

    poll();
    const interval = setInterval(poll, PRESENCE_POLL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [channelId, useSfuPresence, voice]);

  // ── Mesh presence: subscribe to the Gun presence path (read-only) ──
  useEffect(() => {
    if (!channelId) {
      setMeshParticipants([]);
      return;
    }

    let gun;
    try {
      gun = GunInstanceManager.get();
    } catch {
      // Gun not initialized yet
      return;
    }

    const current = meshRef.current;
    current.clear();
    setMeshParticipants([]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ref = (gun as any)
      .get("voice")
      .get(channelId)
      .get("participants")
      .map();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref.on((data: any, key: string) => {
      if (!key || key === "_" || !data) return;

      const hasLeft = data.leftAt && (!data.joinedAt || data.leftAt > data.joinedAt);
      const isStale = data.heartbeat && (Date.now() - data.heartbeat > 30000);

      if (hasLeft || isStale) {
        if (current.has(key)) {
          current.delete(key);
          setMeshParticipants(Array.from(current.values()));
        }
      } else {
        current.set(key, {
          publicKey: key,
          displayName: key.slice(0, 8),
          selfMuted: data.muted ?? false,
          deafened: data.deafened ?? false,
          speaking: data.speaking ?? false,
          serverMuted: false,
        });
        setMeshParticipants(Array.from(current.values()));
      }
    });

    return () => {
      ref.off();
      current.clear();
    };
  }, [channelId]);

  // Merge both tiers (SFU wins on key collision; only one tier is active).
  return useMemo(() => {
    const byKey = new Map<string, VoiceParticipant>();
    for (const p of meshParticipants) byKey.set(p.publicKey, p);
    for (const p of sfuParticipants) byKey.set(p.publicKey, p);
    return Array.from(byKey.values());
  }, [meshParticipants, sfuParticipants]);
}
