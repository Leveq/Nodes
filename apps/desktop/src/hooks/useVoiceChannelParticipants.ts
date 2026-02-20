import { useState, useEffect, useRef } from "react";
import { GunInstanceManager } from "@nodes/transport-gun";
import type { VoiceParticipant } from "@nodes/core";

/**
 * Hook to subscribe to voice channel participants via Gun.
 * This allows showing who's in a voice channel WITHOUT joining it.
 */
export function useVoiceChannelParticipants(channelId: string) {
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const participantsRef = useRef<Map<string, VoiceParticipant>>(new Map());
  
  useEffect(() => {
    if (!channelId) {
      setParticipants([]);
      return;
    }
    
    let gun;
    try {
      gun = GunInstanceManager.get();
    } catch {
      // Gun not initialized yet
      return;
    }
    
    const currentParticipants = participantsRef.current;
    currentParticipants.clear();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ref = (gun as any)
      .get("voice")
      .get(channelId)
      .get("participants")
      .map();
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref.on((data: any, key: string) => {
      if (!key || key === "_" || !data) return;
      
      // Check if participant has left
      const hasLeft = data.leftAt && (!data.joinedAt || data.leftAt > data.joinedAt);
      
      // Check if participant is stale (no heartbeat in last 30 seconds)
      const isStale = data.heartbeat && (Date.now() - data.heartbeat > 30000);
      
      if (hasLeft || isStale) {
        // Remove stale/left participant
        if (currentParticipants.has(key)) {
          currentParticipants.delete(key);
          setParticipants(Array.from(currentParticipants.values()));
        }
      } else {
        // Add/update active participant
        const participant: VoiceParticipant = {
          publicKey: key,
          displayName: key.slice(0, 8),
          selfMuted: data.muted ?? false,
          deafened: data.deafened ?? false,
          speaking: data.speaking ?? false,
          serverMuted: false,
        };
        currentParticipants.set(key, participant);
        setParticipants(Array.from(currentParticipants.values()));
      }
    });
    
    return () => {
      ref.off();
      currentParticipants.clear();
    };
  }, [channelId]);
  
  return participants;
}
