import type { TransportMessage } from "@nodes/transport";

/**
 * Creates a message batcher that collects messages and flushes them
 * to the store in batches using requestAnimationFrame.
 * 
 * This prevents Gun's rapid-fire .map().on() callbacks from causing
 * thousands of individual React state updates per second.
 */
export function createMessageBatcher(
  addMessage: (channelId: string, message: TransportMessage) => void
) {
  const pending = new Map<string, TransportMessage[]>();
  let rafId: number | null = null;

  const flush = () => {
    rafId = null;
    
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
      pending.get(channelId)!.push(message);

      // Schedule flush if not already scheduled
      if (rafId === null) {
        rafId = requestAnimationFrame(flush);
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
      pending.clear();
    },
  };
}
