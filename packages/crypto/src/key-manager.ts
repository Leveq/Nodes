import Gun from "gun";
import "gun/sea";
import type { KeyPair, EncryptedKeystore, KeyBackup } from "./types";

// Access SEA from Gun - use any to work around GunJS typing issues
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SEA = Gun.SEA as any;

/**
 * KeyManager handles keypair generation, local storage, and backup/restore.
 *
 * The keypair is the user's permanent identity. It must be:
 * - Generated locally (never transmitted)
 * - Stored encrypted at rest
 * - Exportable for backup
 * - Importable for device migration
 */
export class KeyManager {
  private keypair: KeyPair | null = null;

  /**
   * Generate a new SEA keypair.
   * This creates a new identity — the public key becomes the user's soul.
   */
  async generateKeypair(): Promise<KeyPair> {
    const pair = await SEA.pair();
    this.keypair = pair as KeyPair;
    return this.keypair;
  }

  /**
   * Get the current loaded keypair.
   * Throws if no keypair is loaded (user not authenticated).
   */
  getKeypair(): KeyPair {
    if (!this.keypair) {
      throw new Error(
        "No keypair loaded. Create or restore an identity first.",
      );
    }
    return this.keypair;
  }

  /**
   * Check if a keypair is currently loaded.
   */
  isAuthenticated(): boolean {
    return this.keypair !== null;
  }

  /**
   * Encrypt and store the keypair locally.
   * Uses a passphrase to derive an encryption key via SEA.work (PBKDF2).
   * A cryptographically random salt is generated and stored alongside the keystore.
   * The encrypted keystore is saved to localStorage or filesystem (via Tauri).
   */
  async saveToLocalStore(passphrase: string): Promise<EncryptedKeystore> {
    const kp = this.getKeypair();
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = btoa(String.fromCharCode(...saltBytes));
    const derived = await SEA.work(passphrase, salt);
    const encrypted = await SEA.encrypt(JSON.stringify(kp), derived as string);

    const keystore: EncryptedKeystore = {
      version: 1,
      encrypted: encrypted as string,
      pub: kp.pub,
      createdAt: Date.now(),
      salt,
    };

    return keystore;
  }

  /**
   * Restore keypair from an encrypted local keystore.
   */
  async restoreFromLocalStore(
    keystore: EncryptedKeystore,
    passphrase: string,
  ): Promise<KeyPair> {
    const salt = keystore.salt ?? keystore.pub; // backwards compat fallback
    const derived = await SEA.work(passphrase, salt);
    const decrypted = await SEA.decrypt(keystore.encrypted, derived as string);

    if (!decrypted) {
      throw new Error("Failed to decrypt keystore. Wrong passphrase?");
    }

    // SEA.decrypt may return an object directly if the original was an object
    const kp: KeyPair = typeof decrypted === "string" 
      ? JSON.parse(decrypted) 
      : decrypted as KeyPair;
    this.keypair = kp;
    return kp;
  }

  /**
   * Export keypair as an encrypted backup file.
   * User provides a backup passphrase (can be different from local passphrase).
   * A cryptographically random salt is generated and stored in the backup.
   */
  async exportBackup(passphrase: string, label: string): Promise<KeyBackup> {
    const kp = this.getKeypair();
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const salt = btoa(String.fromCharCode(...saltBytes));
    const derived = await SEA.work(passphrase, salt);
    const encrypted = await SEA.encrypt(JSON.stringify(kp), derived as string);

    return {
      version: 1,
      encrypted: encrypted as string,
      pub: kp.pub,
      exportedAt: Date.now(),
      label,
      salt,
    };
  }

  /**
   * Import keypair from an encrypted backup file.
   */
  async importBackup(backup: KeyBackup, passphrase: string): Promise<KeyPair> {
    const salt = backup.salt ?? `backup:${backup.pub}`; // backwards compat fallback
    const derived = await SEA.work(passphrase, salt);
    const decrypted = await SEA.decrypt(backup.encrypted, derived as string);

    if (!decrypted) {
      throw new Error("Failed to decrypt backup. Wrong passphrase?");
    }

    // SEA.decrypt may return an object directly if the original was an object
    const kp: KeyPair = typeof decrypted === "string" 
      ? JSON.parse(decrypted) 
      : decrypted as KeyPair;
    this.keypair = kp;
    return kp;
  }

  /**
   * Generate a certificate binding epub to the identity key.
   * Sign the epub with the ECDSA identity key so peers can verify it.
   * The payload includes a `ts` timestamp for informational context;
   * peers check that the signed epub matches the published epub but do not
   * enforce freshness — certs are long-lived per identity.
   * Publish to user.get("profile").get("_epubCert") and user.get("profile").get("_epub").
   */
  async generateEpubCert(): Promise<string> {
    const kp = this.getKeypair();
    const cert = await SEA.sign({ epub: kp.epub, ts: Date.now() }, kp);
    if (!cert) {
      throw new Error("Failed to generate epub certificate. SEA.sign returned falsy.");
    }
    return cert as string;
  }

  /**
   * Sign data with the current keypair.
   */
  async sign(data: unknown): Promise<string> {
    const signed = await SEA.sign(data, this.getKeypair());
    return signed as string;
  }

  /**
   * Verify signed data against a public key.
   */
  async verify(signed: string, pub: string): Promise<unknown> {
    return SEA.verify(signed, pub);
  }

  /**
   * Clear the current keypair from memory.
   */
  logout(): void {
    this.keypair = null;
  }

  /**
   * Load an existing keypair (used when restoring from backup or importing).
   */
  loadKeypair(keypair: KeyPair): void {
    this.keypair = keypair;
  }
}
