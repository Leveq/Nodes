// Ambient types for Gun's SEA module. Gun ships no usable types for `gun/sea`,
// so consumers that pull this package's source (transport-gun, the app) resolve
// it inconsistently. Declaring it here gives every consumer the same shape.
declare module "gun/sea" {
  interface SEAPair {
    pub: string;
    priv: string;
    epub: string;
    epriv: string;
  }

  const SEA: {
    pair(): Promise<SEAPair>;
    sign(data: unknown, pair: SEAPair): Promise<string>;
    verify(data: string, pubOrPair: string | SEAPair): Promise<unknown>;
    encrypt(data: unknown, keyOrPair: string | SEAPair): Promise<string>;
    decrypt(data: string, keyOrPair: string | SEAPair): Promise<unknown>;
    secret(epub: string, pair: SEAPair): Promise<string | undefined>;
    work(
      data: unknown,
      salt?: unknown,
      cb?: unknown,
      opt?: unknown
    ): Promise<string>;
  };

  export default SEA;
}
