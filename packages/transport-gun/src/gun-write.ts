interface GunAckLike {
  err?: string;
  ok?: number;
}

interface GunPuttable {
  put(data: unknown, cb: (ack: GunAckLike) => void): unknown;
}

/**
 * Put and wait for the relay's acknowledgement, bounded by a timeout. Gun's
 * plain `.put(data, cb)` never fires the callback if the ack is dropped, which
 * leaves callers hanging forever (e.g. the "stuck on Creating…" bug). This
 * rejects on `ack.err` or after `timeoutMs` so failures surface instead.
 */
export function putWithAck(
  ref: GunPuttable,
  data: unknown,
  timeoutMs = 10000
): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Write timed out — no acknowledgement from the relay."));
    }, timeoutMs);
    ref.put(data, (ack: GunAckLike) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ack && ack.err) reject(new Error(ack.err));
      else resolve();
    });
  });
}
