import { describe, it, expect, beforeAll } from "vitest";
import SEA from "gun/sea";
import {
  canonicalMessagePayload,
  signMessage,
  verifyMessage,
  type SignableMessage,
} from "../message-signing";

interface Pair {
  pub: string;
  priv: string;
  epub: string;
  epriv: string;
}

let alice: Pair;
let mallory: Pair;

beforeAll(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  alice = (await (SEA as any).pair()) as Pair;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mallory = (await (SEA as any).pair()) as Pair;
});

function baseMessage(overrides: Partial<SignableMessage> = {}): SignableMessage {
  return {
    id: "msg-1",
    channelId: "chan-1",
    authorKey: alice.pub,
    timestamp: 1_700_000_000_000,
    type: "text",
    content: "hello world",
    signedBy: alice.pub,
    ...overrides,
  };
}

/** Build the stored-shape object a reader would see, with a real signature. */
async function storedFrom(m: SignableMessage, pair: Pair) {
  const signature = await signMessage(m, pair);
  return { ...m, signature };
}

describe("canonicalMessagePayload", () => {
  it("is deterministic regardless of input key order", () => {
    const a = canonicalMessagePayload({
      id: "x",
      channelId: "c",
      authorKey: "k",
      timestamp: 1,
      content: "hi",
    });
    const b = canonicalMessagePayload({
      content: "hi",
      timestamp: 1,
      authorKey: "k",
      channelId: "c",
      id: "x",
    });
    expect(a).toBe(b);
  });

  it("defaults optional fields so absent == explicit-null", () => {
    const withDefaults = canonicalMessagePayload(baseMessage());
    const withNulls = canonicalMessagePayload(
      baseMessage({
        attachments: null,
        replyTo: null,
        edited: false,
        editedAt: null,
        deleted: false,
        deletedAt: null,
        deletedBy: null,
      })
    );
    expect(withDefaults).toBe(withNulls);
  });
});

describe("verifyMessage", () => {
  it("verifies a well-formed signed message", async () => {
    const stored = await storedFrom(baseMessage(), alice);
    expect(await verifyMessage(stored)).toBe(true);
  });

  it("verifies a message with attachments and a reply", async () => {
    const stored = await storedFrom(
      baseMessage({
        attachments: JSON.stringify([{ cid: "Qm...", name: "a.png" }]),
        replyTo: JSON.stringify({
          messageId: "m0",
          authorKey: mallory.pub,
          contentPreview: "prev",
        }),
      }),
      alice
    );
    expect(await verifyMessage(stored)).toBe(true);
  });

  it("rejects tampered content", async () => {
    const stored = await storedFrom(baseMessage(), alice);
    stored.content = "malicious edit";
    expect(await verifyMessage(stored)).toBe(false);
  });

  it("rejects a forged authorKey (impersonation)", async () => {
    // Mallory signs a message but stamps Alice's key as the author.
    const forged = await storedFrom(
      baseMessage({ authorKey: alice.pub, signedBy: mallory.pub }),
      mallory
    );
    // Attacker rewrites signedBy to Alice to hide the real signer.
    forged.signedBy = alice.pub;
    expect(await verifyMessage(forged)).toBe(false);
  });

  it("rejects a message with no signature (legacy / unsigned)", async () => {
    const unsigned = baseMessage();
    expect(await verifyMessage(unsigned)).toBe(false);
  });

  it("rejects a signature from a different signer", async () => {
    const stored = await storedFrom(baseMessage(), alice);
    // Verify against Mallory's key instead of the real signer.
    stored.signedBy = mallory.pub;
    expect(await verifyMessage(stored)).toBe(false);
  });

  it("verifies a moderator-style delete signed by a non-author", async () => {
    const stored = await storedFrom(
      baseMessage({
        content: "[deleted]",
        deleted: true,
        deletedAt: 1_700_000_100_000,
        deletedBy: mallory.pub,
        signedBy: mallory.pub,
      }),
      mallory
    );
    // Signature is valid for the declared signer; authorization is a
    // separate concern (verification proves identity, not authority).
    expect(await verifyMessage(stored)).toBe(true);
  });
});
