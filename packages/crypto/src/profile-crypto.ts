import Gun from "gun";
import "gun/sea";
import type { KeyPair } from "./types";

// Access SEA from Gun - use any to work around GunJS typing issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SEA = Gun.SEA as any;

/**
 * ProfileCrypto handles encryption/decryption of profile fields
 * based on per-field visibility settings.
 *
 * See Architecture Spec Section 2.7.3 (Granular Per-Field Visibility)
 */
export class ProfileCrypto {
  /**
   * Encrypt a profile field value for a specific visibility level.
   *
   * - "public": No encryption, return plaintext
   * - "friends": Encrypt with a group key shared with friends
   * - "nobody": Encrypt with user's own key (only self can read)
   * - "custom": Encrypt with a custom group key
   */
  async encryptField(
    value: string,
    visibility: string,
    keypair: KeyPair,
    groupKey?: string,
  ): Promise<string> {
    switch (visibility) {
      case "public":
        return value; // No encryption for public fields

      case "nobody": {
        // Encrypt with own secret (self-encrypt)
        const selfSecret = await SEA.secret(keypair.epub, keypair);
        const encrypted = await SEA.encrypt(value, selfSecret as string);
        return encrypted as string;
      }

      case "friends":
      case "node-members":
      case "custom": {
        if (!groupKey) {
          throw new Error(`Group key required for visibility: ${visibility}`);
        }
        const encrypted = await SEA.encrypt(value, groupKey);
        return encrypted as string;
      }

      default:
        throw new Error(`Unknown visibility level: ${visibility}`);
    }
  }

  /**
   * Decrypt a profile field value.
   */
  async decryptField(
    encrypted: string,
    visibility: string,
    keypair: KeyPair,
    groupKey?: string,
  ): Promise<string> {
    switch (visibility) {
      case "public":
        return encrypted; // Already plaintext

      case "nobody": {
        const selfSecret = await SEA.secret(keypair.epub, keypair);
        const result = await SEA.decrypt(encrypted, selfSecret as string);
        if (!result) throw new Error("Failed to decrypt field");
        return result as string;
      }

      case "friends":
      case "node-members":
      case "custom": {
        if (!groupKey) {
          throw new Error(`Group key required for visibility: ${visibility}`);
        }
        const result = await SEA.decrypt(encrypted, groupKey);
        if (!result) throw new Error("Failed to decrypt field");
        return result as string;
      }

      default:
        throw new Error(`Unknown visibility level: ${visibility}`);
    }
  }

  /**
   * Generate a shared secret between two users for DMs or profile access.
   * Uses ECDH key exchange via SEA.secret.
   */
  async generateSharedSecret(
    recipientEpub: string,
    senderKeypair: KeyPair,
  ): Promise<string> {
    const secret = await SEA.secret(recipientEpub, senderKeypair);
    return secret as string;
  }

  /**
   * Generate a new random group key for friends list or custom visibility.
   */
  async generateGroupKey(): Promise<string> {
    // Use SEA.pair to generate entropy, then derive a key
    const ephemeral = await SEA.pair();
    const key = await SEA.work(
      (ephemeral as KeyPair).priv,
      (ephemeral as KeyPair).pub,
    );
    return key as string;
  }
}
