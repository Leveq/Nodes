import { describe, it, expect, vi, beforeEach } from "vitest";
import { KeyManager } from "../key-manager";
import type { KeyPair, EncryptedKeystore, KeyBackup } from "../types";

// Mock gun and gun/sea since GunJS SEA is not compatible with the Node test environment
vi.mock("gun", () => ({
  default: {
    SEA: {
      pair: vi.fn(),
      work: vi.fn(),
      encrypt: vi.fn(),
      decrypt: vi.fn(),
      sign: vi.fn(),
      verify: vi.fn(),
    },
  },
}));

vi.mock("gun/sea", () => ({}));

import Gun from "gun";

const mockSEA = Gun.SEA as unknown as {
  pair: ReturnType<typeof vi.fn>;
  work: ReturnType<typeof vi.fn>;
  encrypt: ReturnType<typeof vi.fn>;
  decrypt: ReturnType<typeof vi.fn>;
  sign: ReturnType<typeof vi.fn>;
  verify: ReturnType<typeof vi.fn>;
};

const fakeKeypair: KeyPair = {
  pub: "test-pub-key",
  priv: "test-priv-key",
  epub: "test-epub-key",
  epriv: "test-epriv-key",
};

describe("KeyManager", () => {
  let km: KeyManager;

  beforeEach(() => {
    km = new KeyManager();
    vi.clearAllMocks();
  });

  describe("generateKeypair", () => {
    it("generates and stores a keypair", async () => {
      mockSEA.pair.mockResolvedValue(fakeKeypair);

      const kp = await km.generateKeypair();

      expect(kp).toEqual(fakeKeypair);
      expect(km.isAuthenticated()).toBe(true);
    });
  });

  describe("getKeypair", () => {
    it("throws if no keypair is loaded", () => {
      expect(() => km.getKeypair()).toThrow("No keypair loaded");
    });

    it("returns the loaded keypair", async () => {
      mockSEA.pair.mockResolvedValue(fakeKeypair);
      await km.generateKeypair();
      expect(km.getKeypair()).toEqual(fakeKeypair);
    });
  });

  describe("saveToLocalStore", () => {
    beforeEach(async () => {
      mockSEA.pair.mockResolvedValue(fakeKeypair);
      await km.generateKeypair();
    });

    it("uses a random salt (not the public key)", async () => {
      mockSEA.work.mockResolvedValue("derived-key");
      mockSEA.encrypt.mockResolvedValue("encrypted-data");

      const store = await km.saveToLocalStore("passphrase");

      // Salt should NOT be the public key (random)
      expect(store.salt).toBeDefined();
      expect(store.salt).not.toBe(fakeKeypair.pub);
      // Salt should be a base64 string (16 bytes → ~24 chars)
      expect(store.salt!.length).toBeGreaterThan(0);
    });

    it("calls SEA.work with the random salt, not the pub key", async () => {
      mockSEA.work.mockResolvedValue("derived-key");
      mockSEA.encrypt.mockResolvedValue("encrypted-data");

      const store = await km.saveToLocalStore("passphrase");

      expect(mockSEA.work).toHaveBeenCalledWith("passphrase", store.salt);
      expect(mockSEA.work).not.toHaveBeenCalledWith("passphrase", fakeKeypair.pub);
    });

    it("generates a different salt each time", async () => {
      mockSEA.work.mockResolvedValue("derived-key");
      mockSEA.encrypt.mockResolvedValue("encrypted-data");

      const store1 = await km.saveToLocalStore("passphrase");
      const store2 = await km.saveToLocalStore("passphrase");

      expect(store1.salt).not.toBe(store2.salt);
    });
  });

  describe("restoreFromLocalStore", () => {
    it("uses keystore.salt when present (new format)", async () => {
      mockSEA.work.mockResolvedValue("derived-key");
      mockSEA.decrypt.mockResolvedValue(fakeKeypair);

      const keystore: EncryptedKeystore = {
        version: 1,
        encrypted: "enc-data",
        pub: fakeKeypair.pub,
        createdAt: Date.now(),
        salt: "random-base64-salt",
      };

      await km.restoreFromLocalStore(keystore, "passphrase");

      expect(mockSEA.work).toHaveBeenCalledWith("passphrase", "random-base64-salt");
    });

    it("falls back to pub key as salt for old keystores without salt field", async () => {
      mockSEA.work.mockResolvedValue("derived-key");
      mockSEA.decrypt.mockResolvedValue(fakeKeypair);

      const keystore: EncryptedKeystore = {
        version: 1,
        encrypted: "enc-data",
        pub: fakeKeypair.pub,
        createdAt: Date.now(),
        // no salt field
      };

      await km.restoreFromLocalStore(keystore, "passphrase");

      expect(mockSEA.work).toHaveBeenCalledWith("passphrase", fakeKeypair.pub);
    });

    it("throws on decryption failure", async () => {
      mockSEA.work.mockResolvedValue("derived-key");
      mockSEA.decrypt.mockResolvedValue(null);

      const keystore: EncryptedKeystore = {
        version: 1,
        encrypted: "enc-data",
        pub: fakeKeypair.pub,
        createdAt: Date.now(),
      };

      await expect(km.restoreFromLocalStore(keystore, "wrong-passphrase")).rejects.toThrow(
        "Failed to decrypt keystore"
      );
    });
  });

  describe("exportBackup", () => {
    beforeEach(async () => {
      mockSEA.pair.mockResolvedValue(fakeKeypair);
      await km.generateKeypair();
    });

    it("uses a random salt (not backup:pub)", async () => {
      mockSEA.work.mockResolvedValue("derived-key");
      mockSEA.encrypt.mockResolvedValue("encrypted-data");

      const backup = await km.exportBackup("passphrase", "my-backup");

      expect(backup.salt).toBeDefined();
      expect(backup.salt).not.toBe(`backup:${fakeKeypair.pub}`);
      expect(backup.label).toBe("my-backup");
    });

    it("calls SEA.work with the random salt", async () => {
      mockSEA.work.mockResolvedValue("derived-key");
      mockSEA.encrypt.mockResolvedValue("encrypted-data");

      const backup = await km.exportBackup("passphrase", "my-backup");

      expect(mockSEA.work).toHaveBeenCalledWith("passphrase", backup.salt);
    });
  });

  describe("importBackup", () => {
    it("uses backup.salt when present (new format)", async () => {
      mockSEA.work.mockResolvedValue("derived-key");
      mockSEA.decrypt.mockResolvedValue(fakeKeypair);

      const backup: KeyBackup = {
        version: 1,
        encrypted: "enc-data",
        pub: fakeKeypair.pub,
        exportedAt: Date.now(),
        label: "my-backup",
        salt: "random-base64-salt",
      };

      await km.importBackup(backup, "passphrase");

      expect(mockSEA.work).toHaveBeenCalledWith("passphrase", "random-base64-salt");
    });

    it("falls back to backup:pub for old backups without salt field", async () => {
      mockSEA.work.mockResolvedValue("derived-key");
      mockSEA.decrypt.mockResolvedValue(fakeKeypair);

      const backup: KeyBackup = {
        version: 1,
        encrypted: "enc-data",
        pub: fakeKeypair.pub,
        exportedAt: Date.now(),
        label: "my-backup",
        // no salt field
      };

      await km.importBackup(backup, "passphrase");

      expect(mockSEA.work).toHaveBeenCalledWith("passphrase", `backup:${fakeKeypair.pub}`);
    });
  });

  describe("generateEpubCert", () => {
    beforeEach(async () => {
      mockSEA.pair.mockResolvedValue(fakeKeypair);
      await km.generateKeypair();
    });

    it("signs the epub with the keypair and returns a cert string", async () => {
      mockSEA.sign.mockResolvedValue("signed-cert-data");

      const cert = await km.generateEpubCert();

      expect(mockSEA.sign).toHaveBeenCalledWith(
        expect.objectContaining({ epub: fakeKeypair.epub }),
        fakeKeypair
      );
      expect(cert).toBe("signed-cert-data");
    });

    it("includes a timestamp in the signed payload", async () => {
      mockSEA.sign.mockResolvedValue("signed-cert-data");

      await km.generateEpubCert();

      const signedPayload = mockSEA.sign.mock.calls[0][0];
      expect(signedPayload).toHaveProperty("ts");
      expect(typeof signedPayload.ts).toBe("number");
    });

    it("throws if SEA.sign returns falsy", async () => {
      mockSEA.sign.mockResolvedValue(null);

      await expect(km.generateEpubCert()).rejects.toThrow(
        "Failed to generate epub certificate"
      );
    });
  });

  describe("logout", () => {
    it("clears the keypair", async () => {
      mockSEA.pair.mockResolvedValue(fakeKeypair);
      await km.generateKeypair();

      km.logout();

      expect(km.isAuthenticated()).toBe(false);
    });
  });
});
