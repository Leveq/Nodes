import { create } from "zustand";
import { KeyManager } from "@nodes/crypto";
import {
  GunInstanceManager,
  GunAuthProvider,
  ProfileManager,
  GunPresenceTransport,
} from "@nodes/transport-gun";
import type { EncryptedKeystore, KeyBackup, KeyPair } from "@nodes/crypto";
import type {
  ProfileData,
  ProfileWithVisibility,
} from "@nodes/transport-gun";
import type { FieldVisibility } from "@nodes/core";

interface IdentityState {
  // State
  isAuthenticated: boolean;
  isLoading: boolean;
  publicKey: string | null;
  keypair: KeyPair | null;
  profile: ProfileWithVisibility | null;
  profileVersion: number; // Increments on profile update to signal cache invalidation
  error: string | null;

  // Actions
  createIdentity: (
    displayName: string,
    passphrase: string,
    accountVisibility: "public" | "private",
  ) => Promise<void>;
  login: (passphrase: string) => Promise<void>;
  logout: () => void;
  updateProfile: (updates: Partial<ProfileData>) => Promise<void>;
  updateFieldVisibility: (
    field: keyof ProfileData,
    visibility: FieldVisibility,
  ) => Promise<void>;
  exportBackup: (passphrase: string, label: string) => Promise<KeyBackup>;
  importBackup: (
    backup: KeyBackup,
    passphrase: string,
    localPassphrase: string,
  ) => Promise<void>;
  resolveProfile: (publicKey: string) => Promise<Partial<ProfileData> | null>;
  changePassphrase: (
    currentPassphrase: string,
    newPassphrase: string,
  ) => Promise<void>;
  deleteIdentity: () => Promise<void>;
}

const keyManager = new KeyManager();
const authProvider = new GunAuthProvider();
const profileManager = new ProfileManager();
const presenceTransport = new GunPresenceTransport();

// LocalStorage key for the encrypted keystore
const KEYSTORE_KEY = "nodes:keystore";

export const useIdentityStore = create<IdentityState>((set, get) => ({
  isAuthenticated: false,
  isLoading: false,
  publicKey: null,
  keypair: null,
  profile: null,
  profileVersion: 0,
  error: null,

  createIdentity: async (displayName, passphrase, accountVisibility) => {
    set({ isLoading: true, error: null });

    try {
      // 1. Initialize Gun
      GunInstanceManager.init();

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
        keypair,
        profile,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  login: async (passphrase) => {
    set({ isLoading: true, error: null });

    try {
      // 1. Initialize Gun
      GunInstanceManager.init();

      // 2. Load encrypted keystore from localStorage
      const stored = localStorage.getItem(KEYSTORE_KEY);
      if (!stored) {
        throw new Error("No identity found. Create one or import a backup.");
      }

      const keystore: EncryptedKeystore = JSON.parse(stored);

      // 3. Decrypt keystore with passphrase
      const keypair = await keyManager.restoreFromLocalStore(
        keystore,
        passphrase,
      );

      // 4. Authenticate with Gun
      await authProvider.authenticate(keypair);

      // 5. Ensure epub is published (needed for DMs - backfill for existing users)
      const user = GunInstanceManager.user();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (user.get("profile") as any).get("_epub").put(keypair.epub);

      // 6. Load profile from user graph (with timeout)
      let profile: ProfileWithVisibility | null = null;
      try {
        profile = await Promise.race([
          profileManager.getOwnProfile(keypair),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error("Profile load timeout")), 5000)
          ),
        ]);
      } catch {
        // Profile might not exist yet or Gun is slow, continue with null profile
        profile = null;
      }

      set({
        isAuthenticated: true,
        isLoading: false,
        publicKey: keypair.pub,
        keypair,
        profile,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: () => {
    // Set offline and stop heartbeat
    presenceTransport.goOffline().catch(() => {
      // Ignore errors during logout
    });
    
    keyManager.logout();
    set({
      isAuthenticated: false,
      publicKey: null,
      keypair: null,
      profile: null,
      error: null,
    });
  },

  updateProfile: async (updates) => {
    const { profile, profileVersion } = get();
    const keypair = keyManager.getKeypair();
    if (!profile) throw new Error("No profile loaded");

    const newProfile: ProfileWithVisibility = {
      data: { ...profile.data, ...updates },
      fieldVisibility: profile.fieldVisibility,
    };

    await profileManager.saveProfile(newProfile, keypair);
    set({ profile: newProfile, profileVersion: profileVersion + 1 });
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
      GunInstanceManager.init();

      // 1. Decrypt the backup to get the keypair
      const keypair = await keyManager.importBackup(backup, passphrase);

      // 2. Authenticate with Gun
      await authProvider.authenticate(keypair);

      // 3. Ensure epub is published (needed for DMs)
      const user = GunInstanceManager.user();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (user.get("profile") as any).get("_epub").put(keypair.epub);

      // 4. Load existing profile from graph
      const profile = await profileManager.getOwnProfile(keypair);

      // 5. Save to local keystore with the new local passphrase
      const keystore = await keyManager.saveToLocalStore(localPassphrase);
      localStorage.setItem(KEYSTORE_KEY, JSON.stringify(keystore));

      set({
        isAuthenticated: true,
        isLoading: false,
        publicKey: keypair.pub,
        keypair,
        profile,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  resolveProfile: async (publicKey) => {
    return profileManager.getPublicProfile(publicKey);
  },

  changePassphrase: async (currentPassphrase, newPassphrase) => {
    // 1. Verify current passphrase by attempting to decrypt
    const stored = localStorage.getItem(KEYSTORE_KEY);
    if (!stored) throw new Error("No keystore found.");

    const keystore: EncryptedKeystore = JSON.parse(stored);

    try {
      await keyManager.restoreFromLocalStore(keystore, currentPassphrase);
    } catch {
      throw new Error("Current passphrase is incorrect.");
    }

    // 2. Re-encrypt with new passphrase
    const newKeystore = await keyManager.saveToLocalStore(newPassphrase);
    localStorage.setItem(KEYSTORE_KEY, JSON.stringify(newKeystore));

    // 3. Done — keypair in memory is unchanged
  },

  deleteIdentity: async () => {
    // 1. Set offline presence
    await presenceTransport.goOffline().catch(() => {});

    // 2. Clear localStorage
    localStorage.removeItem(KEYSTORE_KEY);
    
    // 3. Logout (clears in-memory state)
    keyManager.logout();

    set({
      isAuthenticated: false,
      publicKey: null,
      keypair: null,
      profile: null,
      error: null,
    });
  },
}));
