import SEA from "gun/sea";
import type { KeyPair } from "./types";

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

    const secret = await SEA.secret(recipientEpub, senderKeypair);
    if (!secret) {
      throw new Error("Failed to derive shared secret");
    }

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
   */
  async decryptMessage(
    encrypted: string,
    recipientEpub: string,
    myKeypair: KeyPair
  ): Promise<string> {
    const secret = await this.getSharedSecret(recipientEpub, myKeypair);
    const result = await SEA.decrypt(encrypted, secret);

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
