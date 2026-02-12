export interface KeyPair {
  pub: string;
  priv: string;
  epub: string;
  epriv: string;
}

export interface EncryptedKeystore {
  version: 1;
  encrypted: string; // SEA.encrypt(keypair, passphrase-derived key)
  pub: string; // Public key stored in plaintext for identification
  createdAt: number;
}

export interface KeyBackup {
  version: 1;
  encrypted: string;
  pub: string;
  exportedAt: number;
  label: string; // User-provided label for the backup
}
