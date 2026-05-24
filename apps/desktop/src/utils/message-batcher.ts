import type { TransportMessage } from "@nodes/transport";

/**
 * Creates a message batcher that collects messages and flushes them
 * to the store in batches using requestAnimationFrame.
 * 
 * This prevents Gun's rapid-fire .map().on() callbacks from causing
 * thousands of individual React state updates per second.
 *
 * Includes a safety bound: if pending messages exceed MAX_PENDING_PER_CHANNEL,
 * a fallback setTimeout flush fires to prevent unbounded growth during
 * system sleep when RAF callbacks are paused.
 */
const MAX_PENDING_PER_CHANNEL = 500;

export function createMessageBatcher(
  addMessage: (channelId: string, message: TransportMessage) => void
) {
  const pending = new Map<string, TransportMessage[]>();
  let rafId: number | null = null;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    rafId = null;
    if (fallbackTimer !== null) {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
    }
    
    // Process all pending messages
    for (const [channelId, messages] of pending) {
      for (const message of messages) {
        addMessage(channelId, message);
      }
    }
    pending.clear();
  };

  return {
    /**
     * Queue a message for batched processing.
     * Messages are flushed on the next animation frame.
     */
    add(channelId: string, message: TransportMessage) {
      if (!pending.has(channelId)) {
        pending.set(channelId, []);
      }
      const msgs = pending.get(channelId)!;

      // Safety bound: if too many messages accumulated (e.g. during sleep),
      // force an immediate flush before adding more.
      if (msgs.length >= MAX_PENDING_PER_CHANNEL) {
        flush();
        if (!pending.has(channelId)) {
          pending.set(channelId, []);
        }
      }

      pending.get(channelId)!.push(message);

      // Schedule flush if not already scheduled
      if (rafId === null) {
        rafId = requestAnimationFrame(flush);
        // Fallback: if RAF doesn't fire within 2s (e.g. tab hidden), use setTimeout
        if (fallbackTimer === null) {
          fallbackTimer = setTimeout(flush, 2_000);
        }
      }
    },

    /**
     * Cancel any pending flush (call on cleanup).
     */
    cancel() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      if (fallbackTimer !== null) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      pending.clear();
    },
  };
}
