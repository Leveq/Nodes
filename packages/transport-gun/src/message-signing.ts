import SEA from "gun/sea";

/**
 * Fields covered by a message's signature. `attachments` and `replyTo` are the
 * STORED (already-stringified) forms, so signing and verification operate on the
 * exact bytes that live in the graph.
 */
export interface SignableMessage {
  id: string;
  channelId: string;
  authorKey: string;
  timestamp: number;
  type?: string;
  content?: string;
  attachments?: string | null;
  replyTo?: string | null;
  edited?: boolean;
  editedAt?: number | null;
  deleted?: boolean;
  deletedAt?: number | null;
  deletedBy?: string | null;
  // The key that actually produced the signature. Defaults to authorKey; differs
  // only when a future moderator-delete re-signs another user's message.
  signedBy?: string;
}

/** Deterministic serialization of the security-relevant fields, fixed key order. */
export function canonicalMessagePayload(m: SignableMessage): string {
  return JSON.stringify({
    id: m.id,
    channelId: m.channelId,
    authorKey: m.authorKey,
    timestamp: m.timestamp,
    type: m.type ?? "text",
    content: m.content ?? "",
    attachments: m.attachments ?? null,
    replyTo: m.replyTo ?? null,
    edited: m.edited ?? false,
    editedAt: m.editedAt ?? null,
    deleted: m.deleted ?? false,
    deletedAt: m.deletedAt ?? null,
    deletedBy: m.deletedBy ?? null,
    signedBy: m.signedBy ?? m.authorKey,
  });
}

/** Sign the canonical payload with the author's SEA pair. */
export async function signMessage(
  m: SignableMessage,
  pair: unknown
): Promise<string> {
  return SEA.sign(
    canonicalMessagePayload(m),
    pair as { pub: string; priv: string; epub: string; epriv: string }
  );
}

/**
 * Verify a stored message. Returns true only if a signature is present, verifies
 * against `signedBy` (default `authorKey`), and the recovered payload matches the
 * canonical form of the stored fields. Proves signer identity, not authority.
 */
export async function verifyMessage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
): Promise<boolean> {
  if (!data || typeof data.signature !== "string" || !data.signature) return false;
  const signedBy: string = data.signedBy || data.authorKey;
  if (!signedBy) return false;
  const expected = canonicalMessagePayload(data as SignableMessage);
  try {
    const recovered = await SEA.verify(data.signature, signedBy);
    if (recovered == null) return false;
    // SEA auto-parses a signed JSON string back into an object, so re-canonicalize
    // an object result; a plain string is compared directly.
    const recoveredStr =
      typeof recovered === "string"
        ? recovered
        : canonicalMessagePayload(recovered as SignableMessage);
    return recoveredStr === expected;
  } catch {
    return false;
  }
}
