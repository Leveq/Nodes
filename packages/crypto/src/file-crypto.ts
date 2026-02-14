import SEA from "gun/sea";

/**
 * FileCrypto handles encryption/decryption of files for DM attachments.
 *
 * Uses the same ECDH shared secret as DM messages.
 * Encrypts file bytes as a base64 string via SEA.encrypt,
 * then converts back to bytes for IPFS upload.
 *
 * NOTE: SEA.encrypt works with strings, not raw bytes.
 * We base64-encode the file first, encrypt the base64 string,
 * then convert the encrypted string to bytes for IPFS.
 * This is not the most efficient approach (base64 adds ~33% overhead),
 * but it's compatible with SEA's encryption API.
 *
 * For Phase 4 optimization: use Web Crypto API directly with
 * AES-GCM and the derived shared secret for raw byte encryption.
 */
export class FileCrypto {
  /**
   * Encrypt file bytes for a DM attachment.
   *
   * @param data - Raw file bytes (Uint8Array)
   * @param sharedSecret - ECDH shared secret (from DMCrypto)
   * @returns Encrypted data as Uint8Array (for IPFS upload)
   */
  static async encryptFile(
    data: Uint8Array,
    sharedSecret: string
  ): Promise<Uint8Array> {
    // Convert bytes to base64 string
    const base64 = uint8ArrayToBase64(data);

    // Encrypt with SEA
    const encrypted = await SEA.encrypt(base64, sharedSecret);
    if (!encrypted) {
      throw new Error("Failed to encrypt file");
    }

    // Convert encrypted string to bytes for IPFS
    return new TextEncoder().encode(encrypted);
  }

  /**
   * Decrypt file bytes from a DM attachment.
   *
   * @param encryptedData - Encrypted file bytes from IPFS
   * @param sharedSecret - ECDH shared secret
   * @returns Decrypted file bytes (Uint8Array)
   */
  static async decryptFile(
    encryptedData: Uint8Array,
    sharedSecret: string
  ): Promise<Uint8Array> {
    // Convert bytes back to encrypted string
    const encrypted = new TextDecoder().decode(encryptedData);

    // Decrypt with SEA
    const base64 = await SEA.decrypt(encrypted, sharedSecret);
    if (!base64) {
      throw new Error("Failed to decrypt file. Wrong key?");
    }

    // Convert base64 back to bytes
    return base64ToUint8Array(base64);
  }

  /**
   * Encrypt a filename for a DM attachment.
   *
   * @param filename - Original filename
   * @param sharedSecret - ECDH shared secret
   * @returns Encrypted filename string
   */
  static async encryptFilename(
    filename: string,
    sharedSecret: string
  ): Promise<string> {
    const encrypted = await SEA.encrypt(filename, sharedSecret);
    if (!encrypted) {
      throw new Error("Failed to encrypt filename");
    }
    return encrypted;
  }

  /**
   * Decrypt a filename from a DM attachment.
   *
   * @param encryptedFilename - Encrypted filename
   * @param sharedSecret - ECDH shared secret
   * @returns Decrypted filename
   */
  static async decryptFilename(
    encryptedFilename: string,
    sharedSecret: string
  ): Promise<string> {
    const filename = await SEA.decrypt(encryptedFilename, sharedSecret);
    if (!filename) {
      throw new Error("Failed to decrypt filename");
    }
    return filename;
  }
}

// ── Base64 Helpers ──

/**
 * Convert Uint8Array to base64 string.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.length;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
