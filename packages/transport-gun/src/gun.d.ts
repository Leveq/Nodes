declare module "gun" {
  interface GunOptions {
    peers?: string[];
    localStorage?: boolean;
    radisk?: boolean;
    file?: string;
  }

  interface GunAck {
    err?: string;
    ok?: number;
    pub?: string;
  }

  interface GunUserPair {
    pub: string;
    priv: string;
    epub: string;
    epriv: string;
  }

  interface GunUser {
    is?: { pub: string; alias?: string };
    _: { sea?: GunUserPair };
    create: (
      alias: string,
      pass: string,
      cb?: (ack: GunAck) => void,
    ) => GunUser;
    auth: (
      aliasOrPair: string | GunUserPair,
      passOrCb?: string | ((ack: GunAck) => void),
      cb?: (ack: GunAck) => void,
    ) => GunUser;
    leave: () => GunUser;
    recall: (
      opts?: { sessionStorage?: boolean },
      cb?: (ack: GunAck) => void,
    ) => GunUser;
    get: (key: string) => GunNode;
  }

  interface GunNode {
    get: (key: string) => GunNode;
    put: (data: unknown, cb?: (ack: GunAck) => void) => GunNode;
    set: (data: unknown, cb?: (ack: GunAck) => void) => GunNode;
    on: (cb: (data: unknown, key: string) => void) => GunNode;
    once: (cb?: (data: unknown, key: string) => void) => GunNode;
    off: () => GunNode;
    map: () => GunNode;
  }

  interface GunInstance extends GunNode {
    user: (pub?: string) => GunUser;
    opt: (options: GunOptions) => GunInstance;
  }

  interface GunStatic {
    (options?: GunOptions): GunInstance;
    SEA: {
      pair: () => Promise<GunUserPair>;
      sign: (data: unknown, pair: GunUserPair) => Promise<string>;
      verify: (data: string, pub: string) => Promise<unknown>;
      encrypt: (data: unknown, secret: string) => Promise<string>;
      decrypt: (data: string, secret: string) => Promise<unknown>;
      secret: (
        epub: string,
        pair: GunUserPair,
      ) => Promise<string>;
      work: (
        data: unknown,
        salt?: unknown,
        options?: unknown,
        cb?: unknown,
      ) => Promise<string>;
    };
  }

  const Gun: GunStatic;
  export default Gun;
}

declare module "gun/sea" {
  // SEA is attached to Gun.SEA, this module just needs to be imported for side effects
}
