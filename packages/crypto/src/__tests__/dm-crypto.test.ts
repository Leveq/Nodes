import { describe, it, expect, vi, beforeEach } from "vitest";
import { DMCrypto, deriveEncryptionKey } from "../dm-crypto";
import type { KeyPair } from "../types";

// Mock gun/sea since GunJS SEA is not compatible with the Node test environment
vi.mock("gun/sea", () => ({
  default: {
    secret: vi.fn(),
    encrypt: vi.fn(),
    decrypt: vi.fn(),
  },
}));

import SEA from "gun/sea";

const mockSEA = SEA as unknown as {
  secret: ReturnType<typeof vi.fn>;
  encrypt: ReturnType<typeof vi.fn>;
  decrypt: ReturnType<typeof vi.fn>;
};

const aliceKeypair: KeyPair = {
  pub: "alice-pub",
  priv: "alice-priv",
  epub: "alice-epub",
  epriv: "alice-epriv",
};

const bobEpub = "bob-epub";

describe("deriveEncryptionKey", () => {
  it("returns a 64-character hex string (256-bit key)", async () => {
    const key = await deriveEncryptionKey("some-raw-secret", "Nodes:ECDH:dm:v1");
    expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces the same output for the same inputs", async () => {
    const key1 = await deriveEncryptionKey("raw-secret", "Nodes:ECDH:dm:v1");
    const key2 = await deriveEncryptionKey("raw-secret", "Nodes:ECDH:dm:v1");
    expect(key1).toBe(key2);
  });

  it("produces different output for different context strings", async () => {
    const key1 = await deriveEncryptionKey("raw-secret", "Nodes:ECDH:dm:v1");
    const key2 = await deriveEncryptionKey("raw-secret", "Nodes:ECDH:profile:v1");
    expect(key1).not.toBe(key2);
  });

  it("produces different output for different raw secrets", async () => {
    const key1 = await deriveEncryptionKey("secret-a", "Nodes:ECDH:dm:v1");
    const key2 = await deriveEncryptionKey("secret-b", "Nodes:ECDH:dm:v1");
    expect(key1).not.toBe(key2);
  });
});

describe("DMCrypto", () => {
  let dmCrypto: DMCrypto;

  beforeEach(() => {
    dmCrypto = new DMCrypto();
    vi.clearAllMocks();
  });

  describe("getSharedSecret", () => {
    it("derives shared secret via SEA.secret then HKDF", async () => {
      mockSEA.secret.mockResolvedValue("raw-ecdh-secret");

      const secret = await dmCrypto.getSharedSecret(bobEpub, aliceKeypair);

      expect(mockSEA.secret).toHaveBeenCalledWith(bobEpub, aliceKeypair);
      // Result should be a 64-char hex string (from HKDF)
      expect(secret).toMatch(/^[0-9a-f]{64}$/);
    });

    it("caches the shared secret on subsequent calls", async () => {
      mockSEA.secret.mockResolvedValue("raw-ecdh-secret");

      const secret1 = await dmCrypto.getSharedSecret(bobEpub, aliceKeypair);
      const secret2 = await dmCrypto.getSharedSecret(bobEpub, aliceKeypair);

      expect(mockSEA.secret).toHaveBeenCalledTimes(1);
      expect(secret1).toBe(secret2);
    });

    it("throws if SEA.secret returns falsy", async () => {
      mockSEA.secret.mockResolvedValue(null);

      await expect(dmCrypto.getSharedSecret(bobEpub, aliceKeypair)).rejects.toThrow(
        "Failed to derive shared secret"
      );
    });
  });

  describe("encryptMessage", () => {
    it("encrypts using the derived shared secret", async () => {
      mockSEA.secret.mockResolvedValue("raw-secret");
      mockSEA.encrypt.mockResolvedValue("encrypted-ciphertext");

      const result = await dmCrypto.encryptMessage("hello", bobEpub, aliceKeypair);

      expect(mockSEA.encrypt).toHaveBeenCalledWith("hello", expect.stringMatching(/^[0-9a-f]{64}$/));
      expect(result).toBe("encrypted-ciphertext");
    });

    it("throws if encryption fails", async () => {
      mockSEA.secret.mockResolvedValue("raw-secret");
      mockSEA.encrypt.mockResolvedValue(null);

      await expect(
        dmCrypto.encryptMessage("hello", bobEpub, aliceKeypair)
      ).rejects.toThrow("Failed to encrypt message");
    });
  });

  describe("decryptMessage", () => {
    it("decrypts using the derived shared secret", async () => {
      mockSEA.secret.mockResolvedValue("raw-secret");
      mockSEA.decrypt.mockResolvedValue("hello");

      const result = await dmCrypto.decryptMessage("encrypted-ciphertext", bobEpub, aliceKeypair);

      expect(mockSEA.decrypt).toHaveBeenCalledWith("encrypted-ciphertext", expect.stringMatching(/^[0-9a-f]{64}$/));
      expect(result).toBe("hello");
    });

    it("falls back to legacy (raw ECDH) key when HKDF key fails", async () => {
      mockSEA.secret.mockResolvedValue("raw-secret");
      // First call (HKDF key) returns null, second call (raw key) succeeds
      mockSEA.decrypt
        .mockResolvedValueOnce(null)      // HKDF-derived key fails
        .mockResolvedValueOnce("hello");  // Raw legacy key succeeds

      const result = await dmCrypto.decryptMessage("encrypted-ciphertext", bobEpub, aliceKeypair);

      // Should have tried decrypt twice
      expect(mockSEA.decrypt).toHaveBeenCalledTimes(2);
      // First call with HKDF-derived key (64 hex chars)
      expect(mockSEA.decrypt).toHaveBeenNthCalledWith(1, "encrypted-ciphertext", expect.stringMatching(/^[0-9a-f]{64}$/));
      // Second call with raw secret
      expect(mockSEA.decrypt).toHaveBeenNthCalledWith(2, "encrypted-ciphertext", "raw-secret");
      expect(result).toBe("hello");
    });

    it("throws if both HKDF and legacy decryption fail", async () => {
      mockSEA.secret.mockResolvedValue("raw-secret");
      mockSEA.decrypt.mockResolvedValue(null);

      await expect(
        dmCrypto.decryptMessage("encrypted-ciphertext", bobEpub, aliceKeypair)
      ).rejects.toThrow("Failed to decrypt message");
    });
  });

  describe("generateConversationId", () => {
    it("produces the same ID regardless of key order", () => {
      const id1 = DMCrypto.generateConversationId("alice-pub", "bob-pub");
      const id2 = DMCrypto.generateConversationId("bob-pub", "alice-pub");
      expect(id1).toBe(id2);
    });

    it("produces a string prefixed with 'dm-'", () => {
      const id = DMCrypto.generateConversationId("alice-pub", "bob-pub");
      expect(id).toMatch(/^dm-/);
    });
  });

  describe("clearCache", () => {
    it("clears the secret cache so SEA.secret is called again", async () => {
      mockSEA.secret.mockResolvedValue("raw-secret");

      await dmCrypto.getSharedSecret(bobEpub, aliceKeypair);
      dmCrypto.clearCache();
      await dmCrypto.getSharedSecret(bobEpub, aliceKeypair);

      expect(mockSEA.secret).toHaveBeenCalledTimes(2);
    });
  });
});
