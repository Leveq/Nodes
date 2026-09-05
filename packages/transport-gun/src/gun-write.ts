interface GunAckLike {
  err?: string;
  ok?: number;
}

interface GunPuttable {
  put(data: unknown, cb: (ack: GunAckLike) => void): unknown;
}

/**
 * Normalize a Gun ack error into a readable string. Gun types `ack.err` as a
 * string, but at runtime it is sometimes an object, so `new Error(ack.err)`
 * (and string interpolation) produced the "[object Object]" seen in toasts.
 */
export function ackErrorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
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
      if (ack && ack.err) reject(new Error(ackErrorMessage(ack.err)));
      else resolve();
    });
  });
}
