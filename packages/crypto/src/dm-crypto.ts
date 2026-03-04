import SEA from "gun/sea";
import type { KeyPair } from "./types";

/**
 * Derive a cryptographic encryption key from a raw ECDH shared secret using HKDF.
 * Provides domain separation and formal key derivation on top of the bare SEA.secret() output.
 *
 * @param rawSecret - The raw ECDH shared secret (output of SEA.secret())
 * @param context   - Domain-separation info string (e.g. "Nodes:ECDH:dm:v1")
 * @returns Hex-encoded 256-bit derived key
 */
export async function deriveEncryptionKey(
  rawSecret: string,
  context: string
): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(rawSecret),
    { name: "HKDF" },
    false,
    ["deriveBits"]
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: encoder.encode("Nodes:v1"),
      info: encoder.encode(context),
    },
    keyMaterial,
    256
  );
  return Array.from(new Uint8Array(derived))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * DMCrypto handles encryption/decryption for direct messages.
 *
 * Uses ECDH key exchange: both parties derive the same shared secret
 * from their own private key and the other's public encryption key (epub).
 * This shared secret is used to encrypt/decrypt all messages in the conversation.
 *
 * The shared secret is deterministic — it never changes for a given pair of users.
 * Cache it per-conversation to avoid recomputing on every message.
 */
export class DMCrypto {
  private secretCache = new Map<string, string>();

  /**
   * Derive the shared secret for a DM conversation.
   * This is the symmetric key used to encrypt/decrypt all messages.
   *
   * @param recipientEpub - The recipient's public encryption key (epub)
   * @param senderKeypair - The sender's full keypair
   * @returns The shared secret string
   */
  async getSharedSecret(
    recipientEpub: string,
    senderKeypair: KeyPair
  ): Promise<string> {
    const cacheKey = `${recipientEpub}:${senderKeypair.epub}`;

    if (this.secretCache.has(cacheKey)) {
      return this.secretCache.get(cacheKey)!;
    }

    const rawSecret = await SEA.secret(recipientEpub, senderKeypair);
    if (!rawSecret) {
      throw new Error("Failed to derive shared secret");
    }

    const secret = await deriveEncryptionKey(rawSecret as string, "Nodes:ECDH:dm:v1");

    this.secretCache.set(cacheKey, secret);
    return secret;
  }

  /**
   * Encrypt a message for a DM conversation.
   */
  async encryptMessage(
    content: string,
    recipientEpub: string,
    senderKeypair: KeyPair
  ): Promise<string> {
    const secret = await this.getSharedSecret(recipientEpub, senderKeypair);
    const encrypted = await SEA.encrypt(content, secret);
    if (!encrypted) {
      throw new Error("Failed to encrypt message");
    }
    return encrypted;
  }

  /**
   * Decrypt a DM message.
   *
   * NOTE: Backwards compatibility fallback — messages encrypted before PR #45 used a raw ECDH
   * secret (no HKDF). Try the new key first; fall back to the legacy key for older messages.
   * This fallback can be removed once all messages have been rotated to the new key format.
   */
  async decryptMessage(
    encrypted: string,
    recipientEpub: string,
    myKeypair: KeyPair
  ): Promise<string> {
    const secret = await this.getSharedSecret(recipientEpub, myKeypair);
    let result = await SEA.decrypt(encrypted, secret);

    if (result === undefined || result === null) {
      // Fallback: try legacy key (raw ECDH, no HKDF) for messages encrypted before the HKDF hardening
      console.log("[DMCrypto] HKDF key failed, trying legacy raw ECDH key fallback");
      const rawSecret = await SEA.secret(recipientEpub, myKeypair);
      result = await SEA.decrypt(encrypted, rawSecret as string);
      if (result !== undefined && result !== null) {
        console.log("[DMCrypto] Legacy fallback succeeded");
      } else {
        console.warn("[DMCrypto] Both HKDF and legacy keys failed to decrypt");
      }
    }

    if (result === undefined || result === null) {
      throw new Error("Failed to decrypt message. Wrong key?");
    }

    return result as string;
  }

  /**
   * Generate a deterministic conversation ID from two public keys.
   * Both participants will compute the same ID.
   */
  static generateConversationId(pubKeyA: string, pubKeyB: string): string {
    const sorted = [pubKeyA, pubKeyB].sort();
    return hashString(sorted.join(":"));
  }

  /**
   * Clear the secret cache (on logout).
   */
  clearCache(): void {
    this.secretCache.clear();
  }
}

/**
 * Simple string hash for conversation IDs.
 * Not cryptographic — just deterministic and collision-resistant enough for IDs.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  // Convert to base36 and prefix for readability
  return `dm-${Math.abs(hash).toString(36)}`;
}
