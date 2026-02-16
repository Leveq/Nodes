import { useState, useEffect, useCallback, useRef } from "react";
import { useNodeStore } from "../stores/node-store";
import { useHasPermission } from "./usePermissions";
import { GunInstanceManager } from "@nodes/transport-gun";

/**
 * Hook that manages slow mode state for a channel.
 *
 * Returns:
 * - canSend: whether the user can currently send a message
 * - remainingSeconds: countdown until next message allowed
 * - slowModeDelay: the channel's slow mode setting (0 = off)
 * - markSent: function to call after successfully sending a message
 */
export function useSlowMode(channelId: string | null) {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const channels = useNodeStore((s) => activeNodeId ? s.channels[activeNodeId] : []);
  
  // Moderators+ bypass slow mode (editChannelSettings permission implies moderator)
  const canBypass = useHasPermission("editChannelSettings");

  const [slowModeDelay, setSlowModeDelay] = useState<number>(0);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  
  // Track per-channel last sent timestamps
  const lastSentMap = useRef<Map<string, number>>(new Map());

  // Subscribe to channel's slow mode setting
  useEffect(() => {
    if (!channelId || !activeNodeId) {
      setSlowModeDelay(0);
      return;
    }

    // First check local channel state
    const channel = channels?.find((c) => c.id === channelId);
    if (channel?.slowMode !== undefined) {
      setSlowModeDelay(channel.slowMode);
    }

    // Subscribe to real-time updates
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gun = GunInstanceManager.get() as any;
    const ref = gun
      .get("nodes")
      .get(activeNodeId)
      .get("channels")
      .get(channelId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ref.on((data: any) => {
      if (data && typeof data.slowMode === "number") {
        setSlowModeDelay(data.slowMode);
      }
    });

    return () => {
      ref.off();
    };
  }, [channelId, activeNodeId, channels]);

  // Update countdown timer
  useEffect(() => {
    if (!channelId || slowModeDelay === 0 || canBypass) {
      setRemainingSeconds(0);
      return;
    }

    const updateRemaining = () => {
      const lastSent = lastSentMap.current.get(channelId) || 0;
      const elapsed = (Date.now() - lastSent) / 1000;
      const remaining = Math.max(0, slowModeDelay - elapsed);
      setRemainingSeconds(Math.ceil(remaining));
    };

    // Update immediately
    updateRemaining();

    // Then update every 100ms for smooth countdown
    const interval = setInterval(updateRemaining, 100);

    return () => clearInterval(interval);
  }, [channelId, slowModeDelay, canBypass]);

  const markSent = useCallback(() => {
    if (channelId) {
      lastSentMap.current.set(channelId, Date.now());
      if (!canBypass) {
        setRemainingSeconds(slowModeDelay);
      }
    }
  }, [channelId, slowModeDelay, canBypass]);

  return {
    canSend: canBypass || remainingSeconds === 0,
    remainingSeconds,
    slowModeDelay,
    markSent,
    isExempt: canBypass,
  };
}
