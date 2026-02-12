# MILESTONE 1.2 — IDENTITY SYSTEM
## Nodes: Decentralized Communication Platform

---

### OBJECTIVE
Implement the self-sovereign identity system using GunJS SEA. Users generate cryptographic keypairs that serve as their permanent identity. Profile data is stored in the user's own GunJS graph, signed by their keypair. The user IS the server for their own identity. This milestone also implements the public/private account model with per-field visibility controls.

---

### DEFINITION OF DONE
- [ ] User can create a new identity (generates SEA keypair + creates profile in their user graph)
- [ ] User can set a display name, avatar placeholder, bio, and account visibility (public/private)
- [ ] User can close the app, reopen it, and restore their session from encrypted local keystore
- [ ] User can export their keypair as a backup (encrypted file)
- [ ] User can import a keypair backup to restore identity on a new device
- [ ] Profile data is stored in the user's GunJS user graph, signed and verifiable
- [ ] Per-field visibility settings are stored and enforced (public/friends/nobody)
- [ ] Another user (simulated second instance) can resolve a public profile by public key
- [ ] Private profile fields are encrypted and unreadable without shared decryption key
- [ ] All identity operations go through the IAuthProvider transport abstraction
- [ ] Tests cover keypair generation, profile CRUD, encryption/decryption, and session restore

---

### ARCHITECTURE CONTEXT
Reference: Architecture Spec **Section 2.7 (Self-Sovereign Identity & Profile Architecture)**

**Core principle:** The user IS the server for their own identity. No central database stores profiles. Profile data lives in the user's GunJS user graph, rooted at their public key (soul). The public key is the permanent, universal address for the user across the entire network.

**GunJS SEA (Security, Encryption, Authorization):**
- Keypair generation: `SEA.pair()` → `{ pub, priv, epub, epriv }`
- User creation: `gun.user().create(alias, passphrase)`
- Authentication: `gun.user().auth(alias, passphrase)` or `gun.user().auth(keypair)`
- Encryption: `SEA.encrypt(data, sharedSecret)` / `SEA.decrypt(data, sharedSecret)`
- Signing: `SEA.sign(data, keypair)` / `SEA.verify(data, publicKey)`
- Key exchange: `SEA.secret(recipientEpub, senderKeypair)` → shared ECDH secret

---

### DEPENDENCIES TO INSTALL

```bash
# In apps/desktop
cd apps/desktop
pnpm add gun

# In packages/crypto
cd packages/crypto
pnpm add gun
pnpm add -D @types/gun  # if available, otherwise use custom declarations

# In packages/transport-gun
cd packages/transport-gun
pnpm add gun
```

**GunJS type declarations:** GunJS has limited TypeScript support. Create a declaration file if needed:

**packages/transport-gun/src/gun.d.ts:**
```typescript
declare module "gun" {
  const Gun: any;
  export default Gun;
}

declare module "gun/sea" {
  const SEA: {
    pair(): Promise<{
      pub: string;
      priv: string;
      epub: string;
      epriv: string;
    }>;
    sign(data: any, pair: any): Promise<string>;
    verify(data: any, pub: string): Promise<any>;
    encrypt(data: any, secret: string): Promise<string>;
    decrypt(data: string, secret: string): Promise<any>;
    secret(epub: string, pair: any): Promise<string>;
    work(data: any, salt?: any, options?: any, cb?: any): Promise<string>;
  };
  export default SEA;
}
```

---

### STEP-BY-STEP INSTRUCTIONS

#### 1. IMPLEMENT CRYPTO PACKAGE (packages/crypto)

This package handles all cryptographic operations. It wraps GunJS SEA in a clean API and manages the local encrypted keystore.

**packages/crypto/src/index.ts:**
```typescript
export { KeyManager } from "./key-manager";
export { ProfileCrypto } from "./profile-crypto";
export type { EncryptedKeystore, KeyPair } from "./types";
```

**packages/crypto/src/types.ts:**
```typescript
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
```

**packages/crypto/src/key-manager.ts:**
```typescript
import SEA from "gun/sea";
import type { KeyPair, EncryptedKeystore, KeyBackup } from "./types";

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
    this.keypair = pair;
    return pair;
  }

  /**
   * Get the current loaded keypair.
   * Throws if no keypair is loaded (user not authenticated).
   */
  getKeypair(): KeyPair {
    if (!this.keypair) {
      throw new Error("No keypair loaded. Create or restore an identity first.");
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
   * The encrypted keystore is saved to localStorage or filesystem (via Tauri).
   */
  async saveToLocalStore(passphrase: string): Promise<EncryptedKeystore> {
    const kp = this.getKeypair();
    const salt = kp.pub; // Use public key as salt for deterministic derivation
    const derived = await SEA.work(passphrase, salt);
    const encrypted = await SEA.encrypt(JSON.stringify(kp), derived);

    const keystore: EncryptedKeystore = {
      version: 1,
      encrypted,
      pub: kp.pub,
      createdAt: Date.now(),
    };

    return keystore;
  }

  /**
   * Restore keypair from an encrypted local keystore.
   */
  async restoreFromLocalStore(
    keystore: EncryptedKeystore,
    passphrase: string
  ): Promise<KeyPair> {
    const derived = await SEA.work(passphrase, keystore.pub);
    const decrypted = await SEA.decrypt(keystore.encrypted, derived);

    if (!decrypted) {
      throw new Error("Failed to decrypt keystore. Wrong passphrase?");
    }

    const kp: KeyPair = JSON.parse(decrypted);
    this.keypair = kp;
    return kp;
  }

  /**
   * Export keypair as an encrypted backup file.
   * User provides a backup passphrase (can be different from local passphrase).
   */
  async exportBackup(passphrase: string, label: string): Promise<KeyBackup> {
    const kp = this.getKeypair();
    const salt = `backup:${kp.pub}`;
    const derived = await SEA.work(passphrase, salt);
    const encrypted = await SEA.encrypt(JSON.stringify(kp), derived);

    return {
      version: 1,
      encrypted,
      pub: kp.pub,
      exportedAt: Date.now(),
      label,
    };
  }

  /**
   * Import keypair from an encrypted backup file.
   */
  async importBackup(backup: KeyBackup, passphrase: string): Promise<KeyPair> {
    const derived = await SEA.work(passphrase, `backup:${backup.pub}`);
    const decrypted = await SEA.decrypt(backup.encrypted, derived);

    if (!decrypted) {
      throw new Error("Failed to decrypt backup. Wrong passphrase?");
    }

    const kp: KeyPair = JSON.parse(decrypted);
    this.keypair = kp;
    return kp;
  }

  /**
   * Sign data with the current keypair.
   */
  async sign(data: any): Promise<string> {
    return SEA.sign(data, this.getKeypair());
  }

  /**
   * Verify signed data against a public key.
   */
  async verify(signed: string, pub: string): Promise<any> {
    return SEA.verify(signed, pub);
  }

  /**
   * Clear the current keypair from memory.
   */
  logout(): void {
    this.keypair = null;
  }
}
```

**packages/crypto/src/profile-crypto.ts:**
```typescript
import SEA from "gun/sea";
import type { KeyPair } from "./types";

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
    groupKey?: string
  ): Promise<string> {
    switch (visibility) {
      case "public":
        return value; // No encryption for public fields

      case "nobody": {
        // Encrypt with own secret (self-encrypt)
        const selfSecret = await SEA.secret(keypair.epub, keypair);
        return SEA.encrypt(value, selfSecret);
      }

      case "friends":
      case "node-members":
      case "custom": {
        if (!groupKey) {
          throw new Error(`Group key required for visibility: ${visibility}`);
        }
        return SEA.encrypt(value, groupKey);
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
    groupKey?: string
  ): Promise<string> {
    switch (visibility) {
      case "public":
        return encrypted; // Already plaintext

      case "nobody": {
        const selfSecret = await SEA.secret(keypair.epub, keypair);
        const result = await SEA.decrypt(encrypted, selfSecret);
        if (!result) throw new Error("Failed to decrypt field");
        return result;
      }

      case "friends":
      case "node-members":
      case "custom": {
        if (!groupKey) {
          throw new Error(`Group key required for visibility: ${visibility}`);
        }
        const result = await SEA.decrypt(encrypted, groupKey);
        if (!result) throw new Error("Failed to decrypt field");
        return result;
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
    senderKeypair: KeyPair
  ): Promise<string> {
    return SEA.secret(recipientEpub, senderKeypair);
  }

  /**
   * Generate a new random group key for friends list or custom visibility.
   */
  async generateGroupKey(): Promise<string> {
    // Use SEA.pair to generate entropy, then derive a key
    const ephemeral = await SEA.pair();
    return SEA.work(ephemeral.priv, ephemeral.pub);
  }
}
```

#### 2. IMPLEMENT GUN TRANSPORT AUTH PROVIDER (packages/transport-gun)

This implements the IAuthProvider interface from the transport abstraction layer using GunJS.

**packages/transport-gun/src/index.ts:**
```typescript
export { GunAuthProvider } from "./auth-provider";
export { GunInstance } from "./gun-instance";
export { ProfileManager } from "./profile-manager";
```

**packages/transport-gun/src/gun-instance.ts:**
```typescript
import Gun from "gun";
import "gun/sea";

/**
 * Singleton GunJS instance manager.
 * Centralizes Gun initialization and provides access to the gun instance
 * and SEA module throughout the application.
 */

let gunInstance: any = null;

export class GunInstance {
  /**
   * Initialize GunJS with relay peers.
   * In development, we run without relays (local only).
   * In production, relay peers provide persistence and discovery.
   */
  static init(peers?: string[]): any {
    if (gunInstance) return gunInstance;

    gunInstance = Gun({
      peers: peers || [],
      localStorage: true, // Use browser localStorage for persistence
      radisk: true, // Enable Radisk storage engine
    });

    return gunInstance;
  }

  /**
   * Get the current Gun instance.
   */
  static get(): any {
    if (!gunInstance) {
      throw new Error("Gun not initialized. Call GunInstance.init() first.");
    }
    return gunInstance;
  }

  /**
   * Get the Gun user instance for authenticated operations.
   */
  static user(): any {
    return GunInstance.get().user();
  }

  /**
   * Recall existing session (auto-login from stored session).
   */
  static recall(): Promise<any> {
    return new Promise((resolve, reject) => {
      GunInstance.user().recall({ sessionStorage: true }, (ack: any) => {
        if (ack.err) reject(new Error(ack.err));
        else resolve(ack);
      });
    });
  }
}
```

**packages/transport-gun/src/auth-provider.ts:**
```typescript
import type { IAuthProvider, KeyPair, Session } from "@nodes/transport";
import type { User } from "@nodes/core";
import { GunInstance } from "./gun-instance";
import SEA from "gun/sea";

/**
 * GunAuthProvider implements IAuthProvider using GunJS SEA.
 *
 * This is the concrete implementation of the transport abstraction.
 * If GunJS is ever swapped for another protocol, only this file
 * (and the other Gun adapters) need to change.
 */
export class GunAuthProvider implements IAuthProvider {
  /**
   * Create a new identity by generating a SEA keypair.
   * The keypair IS the identity — the public key becomes the user's
   * permanent address (soul) in the GunJS graph.
   */
  async createIdentity(): Promise<KeyPair> {
    const pair = await SEA.pair();
    return pair;
  }

  /**
   * Authenticate with an existing keypair.
   * This logs into Gun's user space, making the user's graph writable.
   */
  async authenticate(keypair: KeyPair): Promise<Session> {
    const gun = GunInstance.get();

    return new Promise((resolve, reject) => {
      gun.user().auth(keypair, (ack: any) => {
        if (ack.err) {
          reject(new Error(`Authentication failed: ${ack.err}`));
          return;
        }

        const user: User = {
          publicKey: keypair.pub,
          displayName: "",
          status: "online",
          visibility: "public",
        };

        resolve({ user, keypair });
      });
    });
  }

  /**
   * Encrypt data for a specific recipient using ECDH shared secret.
   */
  async encrypt(data: string, recipientEpub: string): Promise<string> {
    const gun = GunInstance.get();
    const user = gun.user();
    const pair = user._.sea;

    if (!pair) {
      throw new Error("Not authenticated. Cannot encrypt.");
    }

    const secret = await SEA.secret(recipientEpub, pair);
    return SEA.encrypt(data, secret);
  }

  /**
   * Decrypt data that was encrypted for us.
   */
  async decrypt(data: string): Promise<string> {
    const gun = GunInstance.get();
    const user = gun.user();
    const pair = user._.sea;

    if (!pair) {
      throw new Error("Not authenticated. Cannot decrypt.");
    }

    // For self-encrypted data, derive secret from own keys
    const secret = await SEA.secret(pair.epub, pair);
    const result = await SEA.decrypt(data, secret);

    if (!result) {
      throw new Error("Decryption failed.");
    }

    return result;
  }
}
```

**packages/transport-gun/src/profile-manager.ts:**
```typescript
import { GunInstance } from "./gun-instance";
import { ProfileCrypto } from "@nodes/crypto";
import type { KeyPair } from "@nodes/crypto";
import type { FieldVisibility } from "@nodes/core";
import SEA from "gun/sea";

/**
 * ProfileManager handles reading and writing user profile data
 * in the GunJS user graph.
 *
 * This is the core of the self-sovereign identity model:
 * - Profile data is stored in the USER'S OWN graph
 * - Data is signed by the user's keypair (authenticity)
 * - Fields can be encrypted per visibility settings (privacy)
 * - Other users read the profile by resolving the public key soul
 *
 * See Architecture Spec Section 2.7
 */

export interface ProfileData {
  displayName: string;
  bio: string;
  avatar: string; // IPFS CID or empty string
  banner: string; // IPFS CID or empty string
  status: string;
  visibility: "public" | "private"; // Account-level visibility
}

export interface ProfileFieldConfig {
  field: keyof ProfileData;
  visibility: FieldVisibility;
}

export interface ProfileWithVisibility {
  data: ProfileData;
  fieldVisibility: Record<keyof ProfileData, FieldVisibility>;
}

export class ProfileManager {
  private crypto: ProfileCrypto;

  constructor() {
    this.crypto = new ProfileCrypto();
  }

  /**
   * Create or update the user's profile in their own GunJS graph.
   * Each field is individually processed based on its visibility setting.
   */
  async saveProfile(
    profile: ProfileWithVisibility,
    keypair: KeyPair
  ): Promise<void> {
    const user = GunInstance.user();

    // Store each field with its visibility setting
    for (const [field, value] of Object.entries(profile.data)) {
      const visibility = profile.fieldVisibility[field as keyof ProfileData] || "public";

      // Encrypt field based on visibility
      const processedValue = await this.crypto.encryptField(
        String(value),
        visibility,
        keypair
      );

      // Store the field value and its visibility metadata
      user.get("profile").get(field).put(processedValue);
      user.get("profile").get("_visibility").get(field).put(visibility);
    }

    // Store the account-level visibility setting (always public so others know the account type)
    user.get("profile").get("_accountType").put(profile.data.visibility);

    // Store a timestamp of last profile update
    user.get("profile").get("_updatedAt").put(Date.now());
  }

  /**
   * Read the current user's own profile from their graph.
   * Since it's our own data, we have all decryption keys.
   */
  async getOwnProfile(keypair: KeyPair): Promise<ProfileWithVisibility | null> {
    const user = GunInstance.user();

    return new Promise((resolve) => {
      user.get("profile").once(async (data: any) => {
        if (!data) {
          resolve(null);
          return;
        }

        const fields: (keyof ProfileData)[] = [
          "displayName", "bio", "avatar", "banner", "status", "visibility"
        ];

        const profileData: Partial<ProfileData> = {};
        const fieldVisibility: Partial<Record<keyof ProfileData, FieldVisibility>> = {};

        for (const field of fields) {
          const rawValue = data[field];
          const vis = data._visibility?.[field] || "public";

          fieldVisibility[field] = vis;

          if (rawValue) {
            try {
              profileData[field] = await this.crypto.decryptField(
                rawValue,
                vis,
                keypair
              ) as any;
            } catch {
              profileData[field] = rawValue;
            }
          } else {
            profileData[field] = "" as any;
          }
        }

        resolve({
          data: profileData as ProfileData,
          fieldVisibility: fieldVisibility as Record<keyof ProfileData, FieldVisibility>,
        });
      });
    });
  }

  /**
   * Read another user's profile by their public key.
   * This is the core "user serves their own data" flow:
   *
   * 1. Resolve the target's public key in the Gun graph
   * 2. Traverse to their profile/ sub-graph
   * 3. Read each field, decrypting only if we have the key
   * 4. Return what we can see based on visibility
   */
  async getPublicProfile(publicKey: string): Promise<Partial<ProfileData> | null> {
    const gun = GunInstance.get();

    return new Promise((resolve) => {
      gun.user(publicKey).get("profile").once(async (data: any) => {
        if (!data) {
          resolve(null);
          return;
        }

        const fields: (keyof ProfileData)[] = [
          "displayName", "bio", "avatar", "banner", "status", "visibility"
        ];

        const profileData: Partial<ProfileData> = {};
        const accountType = data._accountType || "public";

        for (const field of fields) {
          const rawValue = data[field];
          const vis = data._visibility?.[field] || "public";

          // We can only read public fields of other users without a shared key
          if (vis === "public" && rawValue) {
            profileData[field] = rawValue as any;
          }
          // For non-public fields, we'd need a shared key (implemented in Milestone 1.6)
          // For now, these fields are simply not included in the response
        }

        // Always include account type so UI knows to show "Request Access" for private accounts
        profileData.visibility = accountType;

        resolve(profileData);
      });
    });
  }

  /**
   * Update a single profile field.
   */
  async updateField(
    field: keyof ProfileData,
    value: string,
    visibility: FieldVisibility,
    keypair: KeyPair
  ): Promise<void> {
    const user = GunInstance.user();
    const processedValue = await this.crypto.encryptField(value, visibility, keypair);

    user.get("profile").get(field).put(processedValue);
    user.get("profile").get("_visibility").get(field).put(visibility);
    user.get("profile").get("_updatedAt").put(Date.now());
  }
}
```

#### 3. IMPLEMENT IDENTITY STORE (apps/desktop — Zustand)

Create the Zustand store that manages identity state in the desktop app.

**apps/desktop/src/stores/identity-store.ts:**
```typescript
import { create } from "zustand";
import { KeyManager, ProfileCrypto } from "@nodes/crypto";
import { GunInstance, GunAuthProvider, ProfileManager } from "@nodes/transport-gun";
import type { KeyPair, EncryptedKeystore, KeyBackup } from "@nodes/crypto";
import type { ProfileData, ProfileWithVisibility } from "@nodes/transport-gun";
import type { FieldVisibility } from "@nodes/core";

interface IdentityState {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  publicKey: string | null;
  profile: ProfileWithVisibility | null;
  error: string | null;

  // Actions
  createIdentity: (
    displayName: string,
    passphrase: string,
    accountVisibility: "public" | "private"
  ) => Promise<void>;
  login: (passphrase: string) => Promise<void>;
  logout: () => void;
  updateProfile: (updates: Partial<ProfileData>) => Promise<void>;
  updateFieldVisibility: (
    field: keyof ProfileData,
    visibility: FieldVisibility
  ) => Promise<void>;
  exportBackup: (passphrase: string, label: string) => Promise<KeyBackup>;
  importBackup: (backup: KeyBackup, passphrase: string, localPassphrase: string) => Promise<void>;
  resolveProfile: (publicKey: string) => Promise<Partial<ProfileData> | null>;
}

const keyManager = new KeyManager();
const authProvider = new GunAuthProvider();
const profileManager = new ProfileManager();

// LocalStorage key for the encrypted keystore
const KEYSTORE_KEY = "nodes:keystore";

export const useIdentityStore = create<IdentityState>((set, get) => ({
  isAuthenticated: false,
  isLoading: false,
  publicKey: null,
  profile: null,
  error: null,

  createIdentity: async (displayName, passphrase, accountVisibility) => {
    set({ isLoading: true, error: null });

    try {
      // 1. Initialize Gun
      GunInstance.init();

      // 2. Generate keypair (this IS the new identity)
      const keypair = await keyManager.generateKeypair();

      // 3. Authenticate with Gun (makes user graph writable)
      await authProvider.authenticate(keypair);

      // 4. Create initial profile in user graph
      const defaultVisibility: Record<keyof ProfileData, FieldVisibility> = {
        displayName: "public", // Always public so people can find you
        bio: accountVisibility === "public" ? "public" : "nobody",
        avatar: accountVisibility === "public" ? "public" : "friends",
        banner: accountVisibility === "public" ? "public" : "friends",
        status: accountVisibility === "public" ? "public" : "friends",
        visibility: "public", // Account type is always public
      };

      const profile: ProfileWithVisibility = {
        data: {
          displayName,
          bio: "",
          avatar: "",
          banner: "",
          status: "online",
          visibility: accountVisibility,
        },
        fieldVisibility: defaultVisibility,
      };

      await profileManager.saveProfile(profile, keypair);

      // 5. Save encrypted keystore locally
      const keystore = await keyManager.saveToLocalStore(passphrase);
      localStorage.setItem(KEYSTORE_KEY, JSON.stringify(keystore));

      set({
        isAuthenticated: true,
        isLoading: false,
        publicKey: keypair.pub,
        profile,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  login: async (passphrase) => {
    set({ isLoading: true, error: null });

    try {
      // 1. Initialize Gun
      GunInstance.init();

      // 2. Load encrypted keystore from localStorage
      const stored = localStorage.getItem(KEYSTORE_KEY);
      if (!stored) {
        throw new Error("No identity found. Create one or import a backup.");
      }

      const keystore: EncryptedKeystore = JSON.parse(stored);

      // 3. Decrypt keystore with passphrase
      const keypair = await keyManager.restoreFromLocalStore(keystore, passphrase);

      // 4. Authenticate with Gun
      await authProvider.authenticate(keypair);

      // 5. Load profile from user graph
      const profile = await profileManager.getOwnProfile(keypair);

      set({
        isAuthenticated: true,
        isLoading: false,
        publicKey: keypair.pub,
        profile,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  logout: () => {
    keyManager.logout();
    set({
      isAuthenticated: false,
      publicKey: null,
      profile: null,
      error: null,
    });
  },

  updateProfile: async (updates) => {
    const { profile } = get();
    const keypair = keyManager.getKeypair();
    if (!profile) throw new Error("No profile loaded");

    const newProfile: ProfileWithVisibility = {
      data: { ...profile.data, ...updates },
      fieldVisibility: profile.fieldVisibility,
    };

    await profileManager.saveProfile(newProfile, keypair);
    set({ profile: newProfile });
  },

  updateFieldVisibility: async (field, visibility) => {
    const { profile } = get();
    const keypair = keyManager.getKeypair();
    if (!profile) throw new Error("No profile loaded");

    const value = profile.data[field];
    await profileManager.updateField(field, String(value), visibility, keypair);

    const newProfile: ProfileWithVisibility = {
      data: profile.data,
      fieldVisibility: { ...profile.fieldVisibility, [field]: visibility },
    };

    set({ profile: newProfile });
  },

  exportBackup: async (passphrase, label) => {
    return keyManager.exportBackup(passphrase, label);
  },

  importBackup: async (backup, passphrase, localPassphrase) => {
    set({ isLoading: true, error: null });

    try {
      GunInstance.init();

      // 1. Decrypt the backup to get the keypair
      const keypair = await keyManager.importBackup(backup, passphrase);

      // 2. Authenticate with Gun
      await authProvider.authenticate(keypair);

      // 3. Load existing profile from graph
      const profile = await profileManager.getOwnProfile(keypair);

      // 4. Save to local keystore with the new local passphrase
      const keystore = await keyManager.saveToLocalStore(localPassphrase);
      localStorage.setItem(KEYSTORE_KEY, JSON.stringify(keystore));

      set({
        isAuthenticated: true,
        isLoading: false,
        publicKey: keypair.pub,
        profile,
      });
    } catch (err: any) {
      set({ isLoading: false, error: err.message });
      throw err;
    }
  },

  resolveProfile: async (publicKey) => {
    return profileManager.getPublicProfile(publicKey);
  },
}));
```

#### 4. BUILD THE IDENTITY UI (apps/desktop/src)

Create the screens for identity creation, login, and profile management.

**File structure:**
```
apps/desktop/src/
├── components/
│   ├── auth/
│   │   ├── CreateIdentity.tsx    # New identity creation form
│   │   ├── Login.tsx             # Passphrase login screen
│   │   ├── ImportBackup.tsx      # Import backup file
│   │   └── AuthGate.tsx          # Routes between auth/app
│   └── profile/
│       ├── ProfileView.tsx       # View own profile
│       ├── ProfileEdit.tsx       # Edit profile fields + visibility
│       └── VisibilityBadge.tsx   # Shows field visibility level
├── stores/
│   └── identity-store.ts        # (created above)
├── App.tsx                       # Updated with routing
├── main.tsx
└── styles/
    └── globals.css
```

**apps/desktop/src/components/auth/AuthGate.tsx:**
```tsx
import { useIdentityStore } from "../../stores/identity-store";
import { CreateIdentity } from "./CreateIdentity";
import { Login } from "./Login";
import { useState } from "react";

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * AuthGate wraps the main app and handles the authentication flow.
 * If no identity exists, shows CreateIdentity.
 * If identity exists but not authenticated, shows Login.
 * If authenticated, renders children (the main app).
 */
export function AuthGate({ children }: AuthGateProps) {
  const { isAuthenticated, isLoading } = useIdentityStore();
  const [mode, setMode] = useState<"login" | "create" | "import">(
    localStorage.getItem("nodes:keystore") ? "login" : "create"
  );

  if (isLoading) {
    return (
      <div className="h-screen w-screen bg-nodes-bg flex items-center justify-center">
        <div className="text-nodes-primary text-xl">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    if (mode === "create") {
      return (
        <CreateIdentity
          onSwitchToLogin={() => setMode("login")}
          onSwitchToImport={() => setMode("import")}
        />
      );
    }
    return (
      <Login
        onSwitchToCreate={() => setMode("create")}
        onSwitchToImport={() => setMode("import")}
      />
    );
  }

  return <>{children}</>;
}
```

**apps/desktop/src/components/auth/CreateIdentity.tsx:**
```tsx
import { useState } from "react";
import { useIdentityStore } from "../../stores/identity-store";

interface Props {
  onSwitchToLogin: () => void;
  onSwitchToImport: () => void;
}

export function CreateIdentity({ onSwitchToLogin, onSwitchToImport }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [accountType, setAccountType] = useState<"public" | "private">("public");
  const [error, setError] = useState<string | null>(null);

  const { createIdentity, isLoading } = useIdentityStore();

  const handleCreate = async () => {
    setError(null);

    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }

    if (passphrase.length < 8) {
      setError("Passphrase must be at least 8 characters.");
      return;
    }

    if (passphrase !== confirmPassphrase) {
      setError("Passphrases do not match.");
      return;
    }

    try {
      await createIdentity(displayName.trim(), passphrase, accountType);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="h-screen w-screen bg-nodes-bg flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <h1 className="text-3xl font-bold text-nodes-primary mb-2">Nodes</h1>
        <p className="text-nodes-text-muted mb-8">Create your identity</p>

        <div className="space-y-4">
          <div>
            <label className="block text-nodes-text text-sm mb-1">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-nodes-surface text-nodes-text border border-nodes-border rounded-lg px-4 py-3 focus:outline-none focus:border-nodes-primary"
              placeholder="How others will see you"
              maxLength={32}
            />
          </div>

          <div>
            <label className="block text-nodes-text text-sm mb-1">Passphrase</label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              className="w-full bg-nodes-surface text-nodes-text border border-nodes-border rounded-lg px-4 py-3 focus:outline-none focus:border-nodes-primary"
              placeholder="Encrypts your keypair locally"
            />
          </div>

          <div>
            <label className="block text-nodes-text text-sm mb-1">Confirm Passphrase</label>
            <input
              type="password"
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              className="w-full bg-nodes-surface text-nodes-text border border-nodes-border rounded-lg px-4 py-3 focus:outline-none focus:border-nodes-primary"
              placeholder="Confirm your passphrase"
            />
          </div>

          <div>
            <label className="block text-nodes-text text-sm mb-3">Account Type</label>
            <div className="flex gap-3">
              <button
                onClick={() => setAccountType("public")}
                className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  accountType === "public"
                    ? "bg-nodes-primary text-white border-nodes-primary"
                    : "bg-nodes-surface text-nodes-text-muted border-nodes-border hover:border-nodes-primary"
                }`}
              >
                Public
              </button>
              <button
                onClick={() => setAccountType("private")}
                className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  accountType === "private"
                    ? "bg-nodes-primary text-white border-nodes-primary"
                    : "bg-nodes-surface text-nodes-text-muted border-nodes-border hover:border-nodes-primary"
                }`}
              >
                Private
              </button>
            </div>
            <p className="text-nodes-text-muted text-xs mt-2">
              {accountType === "public"
                ? "Anyone can view your profile. You control individual field visibility."
                : "Profile encrypted by default. Others must request access to see your details."}
            </p>
          </div>

          {error && (
            <p className="text-nodes-danger text-sm">{error}</p>
          )}

          <button
            onClick={handleCreate}
            disabled={isLoading}
            className="w-full bg-nodes-primary hover:bg-nodes-primary-light text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? "Creating Identity..." : "Create Identity"}
          </button>

          <div className="flex justify-between text-sm">
            <button
              onClick={onSwitchToLogin}
              className="text-nodes-text-muted hover:text-nodes-primary transition-colors"
            >
              Already have an identity? Log in
            </button>
            <button
              onClick={onSwitchToImport}
              className="text-nodes-text-muted hover:text-nodes-primary transition-colors"
            >
              Import backup
            </button>
          </div>
        </div>

        <p className="text-nodes-text-muted text-xs mt-8 text-center opacity-50">
          Your identity is a cryptographic keypair stored only on this device.
          No servers. No accounts. Just math.
        </p>
      </div>
    </div>
  );
}
```

**apps/desktop/src/components/auth/Login.tsx:**
```tsx
import { useState } from "react";
import { useIdentityStore } from "../../stores/identity-store";

interface Props {
  onSwitchToCreate: () => void;
  onSwitchToImport: () => void;
}

export function Login({ onSwitchToCreate, onSwitchToImport }: Props) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { login, isLoading } = useIdentityStore();

  const handleLogin = async () => {
    setError(null);

    try {
      await login(passphrase);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="h-screen w-screen bg-nodes-bg flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <h1 className="text-3xl font-bold text-nodes-primary mb-2">Nodes</h1>
        <p className="text-nodes-text-muted mb-8">Welcome back</p>

        <div className="space-y-4">
          <div>
            <label className="block text-nodes-text text-sm mb-1">Passphrase</label>
            <input
              type="password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-nodes-surface text-nodes-text border border-nodes-border rounded-lg px-4 py-3 focus:outline-none focus:border-nodes-primary"
              placeholder="Enter your passphrase"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-nodes-danger text-sm">{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={isLoading}
            className="w-full bg-nodes-primary hover:bg-nodes-primary-light text-white font-medium py-3 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? "Unlocking..." : "Unlock"}
          </button>

          <div className="flex justify-between text-sm">
            <button
              onClick={onSwitchToCreate}
              className="text-nodes-text-muted hover:text-nodes-primary transition-colors"
            >
              Create new identity
            </button>
            <button
              onClick={onSwitchToImport}
              className="text-nodes-text-muted hover:text-nodes-primary transition-colors"
            >
              Import backup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

**Update apps/desktop/src/App.tsx:**
```tsx
import "./styles/globals.css";
import { AuthGate } from "./components/auth/AuthGate";
import { useIdentityStore } from "./stores/identity-store";

function Dashboard() {
  const { publicKey, profile, logout } = useIdentityStore();

  return (
    <div className="h-screen w-screen bg-nodes-bg text-nodes-text flex flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold text-nodes-primary mb-4">Nodes</h1>
      <div className="bg-nodes-surface border border-nodes-border rounded-xl p-6 max-w-lg w-full">
        <h2 className="text-xl font-semibold mb-4">
          Welcome, {profile?.data.displayName || "User"}
        </h2>
        <div className="space-y-2 text-sm text-nodes-text-muted">
          <p>
            <span className="text-nodes-text">Public Key:</span>{" "}
            <span className="font-mono text-xs break-all">{publicKey}</span>
          </p>
          <p>
            <span className="text-nodes-text">Account Type:</span>{" "}
            {profile?.data.visibility}
          </p>
          <p>
            <span className="text-nodes-text">Status:</span>{" "}
            {profile?.data.status}
          </p>
        </div>
        <button
          onClick={logout}
          className="mt-6 w-full bg-nodes-border hover:bg-nodes-danger text-nodes-text-muted hover:text-white py-2 rounded-lg transition-colors text-sm"
        >
          Lock (Logout)
        </button>
      </div>
      <p className="text-nodes-text-muted text-xs mt-8 opacity-50">
        v0.1.0-alpha — Milestone 1.2
      </p>
    </div>
  );
}

function App() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}

export default App;
```

#### 5. ADD ZUSTAND AS DEPENDENCY

```bash
cd apps/desktop
pnpm add zustand
```

#### 6. WIRE UP PACKAGE DEPENDENCIES

Update package.json files to reference internal packages:

**apps/desktop/package.json** — add to dependencies:
```json
{
  "dependencies": {
    "@nodes/core": "workspace:*",
    "@nodes/crypto": "workspace:*",
    "@nodes/transport": "workspace:*",
    "@nodes/transport-gun": "workspace:*"
  }
}
```

**packages/transport-gun/package.json** — add to dependencies:
```json
{
  "dependencies": {
    "@nodes/core": "workspace:*",
    "@nodes/transport": "workspace:*",
    "@nodes/crypto": "workspace:*"
  }
}
```

---

### VERIFICATION CHECKLIST

1. **Create identity** — Fill out form, click Create. Public key is generated and displayed.
2. **Profile saved** — Profile data appears in the dashboard after creation.
3. **Close and reopen** — Close the app, reopen, enter passphrase. Session restores with profile.
4. **Wrong passphrase** — Enter wrong passphrase on login. Error message shown, no crash.
5. **Public/private toggle** — Create a public account, verify fields are readable. Create a private account, verify fields show as encrypted when viewed externally.
6. **Export backup** — Export keypair backup, verify it produces a JSON file.
7. **Import backup** — On a fresh instance (clear localStorage), import the backup. Identity and profile restore.
8. **Resolve public profile** — Using a second Gun instance (or browser tab), resolve a public user's profile by their public key. Display name and public fields are readable.
9. **Tests pass** — `pnpm test` passes for crypto and identity operations.
10. **Lint clean** — `pnpm lint` passes with no errors.

---

### KNOWN LIMITATIONS (Addressed in Later Milestones)

- **No relay peers yet** — Profile resolution only works between peers that are both online. Relay peers (Milestone 1.4+) will add persistence.
- **No friend request flow** — Private profile access requests are not yet implemented. The crypto layer supports it, but the UI flow comes in Milestone 1.6.
- **No avatar upload** — Avatar is a string field (will become IPFS CID in Phase 2, Milestone 2.4).
- **localStorage for keystore** — In production, Tauri's secure filesystem API should be used instead of browser localStorage. Good enough for now.

---

### NEXT MILESTONE

Once 1.2 is verified, proceed to **Milestone 1.3: Transport Abstraction Layer** which will:
- Fully implement IMessageTransport with GunJS adapter
- Implement IPresenceTransport with GunJS adapter
- Create transport provider context for React
- Add connection status monitoring
- Write comprehensive transport layer tests
