import type { IAuthProvider, KeyPair, Session } from "@nodes/transport";
import type { User } from "@nodes/core";
import { GunInstanceManager } from "./gun-instance";
import Gun from "gun";
import "gun/sea";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SEA = Gun.SEA as any;

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
    return pair as KeyPair;
  }

  /**
   * Authenticate with an existing keypair.
   * This logs into Gun's user space, making the user's graph writable.
   */
  async authenticate(keypair: KeyPair): Promise<Session> {
    const gun = GunInstanceManager.get();

    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      gun.user().auth(keypair as any, (ack: any) => {
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
    const gun = GunInstanceManager.get();
    const user = gun.user();
    const pair = (user as unknown as { _: { sea?: KeyPair } })._.sea;

    if (!pair) {
      throw new Error("Not authenticated. Cannot encrypt.");
    }

    const secret = await SEA.secret(recipientEpub, pair);
    const encrypted = await SEA.encrypt(data, secret as string);
    return encrypted as string;
  }

  /**
   * Decrypt data that was encrypted for us.
   */
  async decrypt(data: string): Promise<string> {
    const gun = GunInstanceManager.get();
    const user = gun.user();
    const pair = (user as unknown as { _: { sea?: KeyPair } })._.sea;

    if (!pair) {
      throw new Error("Not authenticated. Cannot decrypt.");
    }

    // For self-encrypted data, derive secret from own keys
    const secret = await SEA.secret(pair.epub, pair);
    const result = await SEA.decrypt(data, secret as string);

    if (!result) {
      throw new Error("Decryption failed.");
    }

    return result as string;
  }
}
