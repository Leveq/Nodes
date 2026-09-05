# Nodes Security Model

**Version:** 1.0.0-beta · **Last Updated:** March 2026

This document describes the security architecture, threat model, and known limitations of Nodes. It is intended for users who want to understand what Nodes protects against, what it does not, and what is planned for future hardening.

Nodes is a beta product built by a solo developer. It has not undergone a formal security audit. This document is an exercise in transparency, not a guarantee.

---

## Principles

Nodes is built on three security principles:

1. **No PII collection.** Identity is a cryptographic keypair. Nodes never asks for your name, email, phone number, or government ID. There is no account database to breach.

2. **Encryption by default.** Direct messages are end-to-end encrypted before they leave your device. Channel messages are cryptographically signed by the author.

3. **User-owned data.** Your identity, profile, and message history live in your own cryptographic graph. Nodes has no central server that stores your data in plaintext.

---

## Cryptographic Primitives

Nodes uses GunJS SEA (Security, Encryption, Authorization) for all cryptographic operations.

| Operation | Algorithm | Purpose |
|-----------|-----------|---------|
| Identity keypairs | ECDSA (secp256k1) | Signing, identity verification |
| Key exchange | ECDH (secp256k1) | Deriving raw shared secrets for DM encryption |
| DM key derivation | HKDF (SHA-256) | Formally deriving a 256-bit encryption key from the raw ECDH shared secret; provides domain separation |
| DM encryption | AES-256-GCM | Symmetric encryption of message content |
| Message signing | ECDSA | Proving authorship, preventing tampering |
| Profile encryption | AES-256-GCM | Encrypting private profile fields |
| Passphrase key derivation | PBKDF2 | Deriving keystore/backup encryption keys from user passphrases |
| epub certificate | ECDSA | Binding the ECDH public key (epub) to the identity key to prevent MITM epub substitution |

### How DM Encryption Works

1. Alice and Bob each have an ECDSA keypair (signing) and an ECDH keypair (encryption).
2. When Alice wants to send a DM to Bob, her client first fetches Bob's epub (encryption public key) and verifies the epub certificate (see [epub Certificate Binding](#epub-certificate-binding-mitm-protection) below). If the cert is present and valid, the epub is accepted; if it is missing (legacy identity), a warning is logged and the epub is used without MITM check.
3. Alice's client performs an ECDH key exchange using her private encryption key and Bob's verified epub. This produces a raw shared secret that only Alice and Bob can compute.
4. The raw shared secret is passed through HKDF (SHA-256, info `Nodes:ECDH:dm:v1`) to derive a 256-bit encryption key. This provides domain separation and formal key derivation on top of the bare ECDH output.
5. The message content is encrypted with AES-256-GCM using the HKDF-derived key.
6. The encrypted ciphertext is written to the GunJS graph.
7. Bob's client performs the same ECDH exchange (his private key + Alice's epub) and the same HKDF derivation to arrive at the identical encryption key, then decrypts the message.
8. Relay peers only ever see ciphertext. They cannot decrypt the message content.

### epub Certificate Binding: MITM Protection

In ECDH, each party uses their **epub** (encryption public key) to derive the shared secret. Without additional protection, a man-in-the-middle attacker — for example, a malicious relay — could write a different epub into a user's Gun profile and cause the sender to encrypt to the attacker's key instead of the real recipient's key.

To mitigate this, Nodes binds each epub to its identity keypair via a signed certificate:

1. During identity creation (or cert regeneration), `KeyManager.generateEpubCert()` signs the payload `{ epub, ts }` with the user's ECDSA identity private key using `SEA.sign`.
2. The certificate is published alongside the epub in the user's Gun profile (`_epubCert` and `_epub`).
3. Before initiating a DM key exchange, the sender's client (`DMManager.lookupPeerEpub`) fetches both `_epub` and `_epubCert` from the recipient's profile, then calls `SEA.verify(epubCert, recipientPublicKey)`. If the verified payload's `epub` field matches the fetched epub, the epub is accepted.
4. If the epub does not match, or if verification fails, the key exchange is rejected with an error: `epubCert verification failed — possible MITM attack`.
5. If no cert is found (legacy identity created before this feature), a warning is logged and the epub is used without MITM check (graceful degradation).

**What this prevents:** A relay or network attacker cannot silently substitute a different epub for a user. Any substituted epub would not have a valid certificate signed by that user's ECDSA identity private key — forging one requires compromising the victim's identity key.

**Current limitation:** epub certs are long-lived — bound to the keypair, not to a session. If a user's identity private key is compromised, an attacker could issue a new epub cert. Session-level epub binding requires per-message ephemeral key ratcheting (planned in the security roadmap).

**Migration / backward compatibility:** Identities created before this feature do not have `_epubCert` published. The client detects this and falls back to using the epub directly, preserving interoperability with legacy identities. New identities and users who regenerate their cert have full MITM protection. Users with legacy identities can re-publish their cert by triggering `generateEpubCert` + `publishEpubCert` in the auth flow.

### Forward Secrecy: Current Limitation

Nodes currently uses **static ECDH** for DM encryption. This means the shared secret between Alice and Bob is derived from their long-lived keypairs and remains the same for every message they exchange.

**What this means in practice:** If an attacker compromises either Alice's or Bob's private key in the future, they could decrypt every past DM between them — not just future messages. This is because the same shared secret was used for all historical messages.

**How Signal solves this:** Signal implements the Double Ratchet algorithm, which generates a new ephemeral key for every message. Each message is encrypted with a unique key that is deleted after use. Compromising a key at time T reveals nothing about messages sent at time T-1. This property is called Perfect Forward Secrecy (PFS).

**Current risk level:** Low for most users. An attacker would need to both (a) compromise your private key and (b) have captured and stored your encrypted DM traffic from the Gun graph. This is primarily a concern for high-risk users facing targeted, persistent surveillance — not casual attackers or data breaches.

**Planned mitigation:** Implementing an ephemeral key ratchet for DMs is on the security roadmap. This would generate a new ECDH keypair per message (or per message chain), derive a fresh shared secret each time, and delete spent keys. The challenge is integrating ratcheting with GunJS's eventual consistency model, where messages may arrive out of order.

### How Message Signing Works

All channel messages are signed with the author's ECDSA private key. When a message is received, the client verifies the signature against the author's public key. This ensures:

- Messages cannot be forged by other users or relay peers.
- Messages cannot be silently modified in transit.
- Every message has provable authorship.

### Replay Protection: Current Status

A replay attack occurs when an attacker captures a valid signed message and re-injects it into the network, causing it to appear as if the original author sent it again.

**Current mitigation:** Every message in Nodes includes a unique `id` and a `timestamp`. The GunJS graph uses content-addressed storage where each message occupies a unique path. Re-injecting an identical message would write to the same graph path (an idempotent operation — it doesn't create a duplicate), and injecting a modified copy would fail signature verification.

**Remaining gap:** A sophisticated attacker with write access to the Gun graph could potentially construct a new graph path and place a copied message at a different location with a manipulated timestamp. The message signature would still verify (the content is unchanged), but it would appear in a context the author didn't intend. The practical impact is limited — the message content isn't fabricated, only its placement — but it's a theoretical integrity concern.

**Planned mitigation:** Adding a monotonic sequence number or channel-scoped nonce to the signed message payload would make replay attacks detectable. If a message claims to be sequence #47 but #47 already exists with different content, the duplicate is rejected. This requires changes to the message schema and signing envelope.

### Data Validation and Graph Poisoning

A graph poisoning attack occurs when a malicious peer writes invalid or malicious data to the GunJS graph, hoping other clients will accept and render it.

**How Nodes defends against this:**

1. **Signature verification on all messages.** Every message includes an ECDSA signature. When a client receives a message, it verifies the signature against the claimed author's public key before rendering. Unsigned messages or messages with invalid signatures are discarded.

2. **Schema validation.** The client validates message structure before processing. Malformed data (missing fields, wrong types, unexpected content) is rejected.

3. **Author verification for mutations.** Operations like message editing and deletion verify that the requesting user's public key matches the original author's key. A malicious peer cannot edit or delete another user's messages.

4. **Permission checks for moderation actions.** Kick, ban, role changes, and channel modifications verify the actor's role and permissions within the Node's permission hierarchy before applying.

**What this means:** A malicious relay or peer can write garbage to the Gun graph, but Nodes clients will ignore it. The graph may contain invalid data, but it won't be rendered or acted upon. The security boundary is at the client's validation layer, not at the network layer — which is the correct design for a trustless P2P system.

---

## Threat Model

### What Nodes Protects Against

| Threat | Protection |
|--------|-----------|
| **Centralized data breach** | No central database exists. User data lives in distributed peer graphs, not on a company server. There is no honeypot of PII to steal. |
| **Corporate data mining** | Nodes collects zero personal data. No analytics, no telemetry, no ad targeting. |
| **Platform censorship** | A Node ban removes you from that community but does not delete your identity. You retain your keypair, profile, and DM history. |
| **DM content interception** | DMs are E2E encrypted with AES-256-GCM via ECDH key exchange + HKDF key derivation. Relay peers and network observers see only ciphertext. |
| **DM MITM (epub substitution)** | epub certificates bind each user's encryption public key to their ECDSA identity key. A client verifies the cert before accepting an epub for DM encryption. Relay-level epub substitution is rejected. |
| **Message forgery** | All messages are ECDSA-signed. A forged message would fail signature verification. |
| **Single point of failure** | The protocol is peer-to-peer. If a relay goes down, clients can connect to other relays or communicate directly. |
| **Identity theft via server compromise** | Private keys never leave the user's device. There is no server that holds private keys. |

### What Nodes Does NOT Protect Against

| Threat | Current Status | Notes |
|--------|---------------|-------|
| **Device compromise / malware** | Not mitigated | If an attacker has access to your device, they can extract your private key and impersonate you. This is true of all systems that use local key storage, including Signal. |
| **DM metadata exposure** | Partially mitigated | Message *content* is encrypted, but the GunJS graph structure reveals who communicates with whom and when. Timestamps and participant public keys are visible to anyone who can read the graph. |
| **Channel message confidentiality** | Not encrypted | Channel messages are signed (authenticity is verified) but not encrypted. Anyone with access to the channel's Gun graph path can read them. This is by design — channels are community spaces, not private conversations. |
| **IP address exposure** | Partially mitigated | Your IP is always visible to relay peers (Nodes does not route through anonymizing networks). For voice channels, the client defaults to a privacy mode that refuses to connect if the SFU is unavailable rather than silently falling back to P2P mesh, so other participants cannot see your IP without your explicit opt-in. Users who prefer lower latency in small rooms can opt in to P2P mesh in Settings \u2192 Voice \u2192 Voice Privacy, which exposes their IP to other participants. Note that the SFU token endpoint is not yet implemented; until it lands, privacy mode surfaces a configuration error on join. Use a VPN or Tor if relay-level IP privacy is also required. |
| **Traffic analysis** | Not mitigated | An observer monitoring network traffic can determine that you are using Nodes, estimate message frequency, and identify communication patterns, even without reading message content. |
| **Key loss** | Not recoverable | If you lose your keypair and have no backup, your identity is permanently inaccessible. There is no password reset, no recovery email, no support team. This is the fundamental tradeoff of self-sovereign identity. |
| **Relay-level denial of service** | Partially mitigated | The current deployment relies on a single relay cluster. If those relays go down, message persistence is interrupted. The protocol supports multiple relays, and running your own relay mitigates this entirely. |
| **Compromised relay peer** | Partially mitigated | A malicious relay could drop messages, serve stale data, or log metadata. It cannot forge messages (signature verification prevents this), read DMs (E2E encryption prevents this), steal identities (private keys are never transmitted), or silently substitute a peer's epub (epub certificate verification prevents this for identities that have published a cert). |
| **Retroactive DM decryption (no forward secrecy)** | Not mitigated | DMs use static ECDH — the same shared secret encrypts all messages between two users. If a private key is compromised in the future, an attacker who recorded past encrypted traffic could decrypt it. See "Forward Secrecy" section above. |
| **Message replay** | Mostly mitigated | Message IDs and content-addressed graph storage prevent simple replays. A sophisticated attacker could potentially re-place a valid signed message in a different graph context. See "Replay Protection" section above. |
| **Graph poisoning** | Mitigated | Malicious peers can write invalid data to the Gun graph, but clients validate signatures, schemas, and permissions before rendering. Invalid data is silently discarded. See "Data Validation" section above. |

---

## Identity and Key Management

### Key Generation

Identity keypairs are generated client-side using GunJS SEA. The private key never leaves the device unless the user explicitly exports it for backup.

### Key Storage

Private keys are stored in an **encrypted local keystore** on the user's device:

- **Desktop app (Tauri):** Encrypted in the application's local data directory.
- **Web client:** Encrypted in browser storage.

The keystore is encrypted using a passphrase-derived key (PBKDF2 via `SEA.work`). A cryptographically random 16-byte salt is generated via `crypto.getRandomValues()` for each save operation and stored in the keystore alongside the ciphertext. This salt is the input to PBKDF2, ensuring that the same passphrase produces a unique derived key for each keystore — preventing precomputed dictionary attacks and rainbow-table attacks on the passphrase.

### Backup and Recovery

Users can export their keypair as an encrypted backup. This is the **only** recovery mechanism. If the backup is lost and the device is inaccessible, the identity is gone.

Backup files use the same encryption scheme as the local keystore: a passphrase-derived key (PBKDF2) with a cryptographically random 16-byte salt. The salt is stored in the backup file. Each backup export generates a fresh random salt, so two exports of the same keypair with the same passphrase produce distinct ciphertexts.

**Backward compatibility:** Backup files exported before the random-salt hardening used the string `backup:{pub}` as the PBKDF2 salt. The client detects the absence of a `salt` field and falls back to this legacy salt automatically, so old backup files can still be restored.

**Recommendations for users:**

- Back up your keypair immediately after creation.
- Store backups in multiple secure locations (encrypted USB, password manager, printed QR code in a safe).
- Treat your keypair backup like a cryptocurrency seed phrase.

### What Happens If Your Key Is Compromised

If an attacker obtains your private key:

- They can impersonate you — send messages, join Nodes, and modify your profile as you.
- They can decrypt your DMs.
- There is no centralized "revoke" mechanism. You would need to create a new identity and inform your contacts.

**Planned mitigation:** Key rotation and a revocation announcement mechanism are planned for a future release. This would allow a compromised identity to broadcast a signed revocation notice and link to a new identity.

---

## Crypto Hardening (2026)

The following changes were merged as part of the 2026 cryptographic hardening pass. They are additive — no existing functionality was removed.

### HKDF Key Derivation for DM Encryption

Previously, the raw ECDH shared secret produced by `SEA.secret()` was used directly as the AES-256-GCM encryption key for DMs. The raw output is now passed through HKDF (HMAC-based Key Derivation Function, Web Crypto API) before use:

- **Hash:** SHA-256
- **Salt:** Fixed ASCII string `Nodes:v1` (domain marker)
- **Info:** `Nodes:ECDH:dm:v1` (domain separation label)
- **Output length:** 256 bits (32 bytes), hex-encoded

HKDF ensures the derived key has strong pseudo-random properties and is cleanly separated from any other use of the same ECDH shared secret. This also future-proofs the derivation: if DM encryption is extended to additional contexts (e.g., file keys, group keys), each context will receive a distinct derived key from the same base material.

### Random Salt for Keystore and Backup Encryption

Previously, keystores and backup files used the user's public key as the PBKDF2 salt — a static, predictable value. The salt is now generated as 16 cryptographically random bytes via `crypto.getRandomValues()` for each `saveToLocalStore()` and `exportBackup()` call.

**Effect:** An attacker who obtains two keystore files for the same identity (e.g., from different devices) cannot confirm they share the same passphrase by comparing derived keys, because the salts differ. Dictionary and rainbow-table attacks on the passphrase are also significantly harder.

**Backward compatibility:** The `salt` field is optional in both `EncryptedKeystore` and `KeyBackup`. When restoring a file that has no `salt` field (legacy format), the fallback salt is:
- **Keystore:** the public key (`pub`)
- **Backup file:** the string `backup:{pub}`

These match the pre-hardening behavior exactly, so all existing keystores and backup files remain openable with the same passphrase.

### epub Certificate Binding

See ["epub Certificate Binding: MITM Protection"](#epub-certificate-binding-mitm-protection) above for the full description.

**Summary:** A new `generateEpubCert()` + `publishEpubCert()` flow signs the user's epub with their identity ECDSA key and publishes the cert to their Gun profile. The DM handshake now fetches and verifies this cert before accepting an epub. Legacy identities without a cert are handled gracefully with a warning.

### Crypto Test Suite

A new dedicated test suite in `packages/crypto/src/__tests__/` covers all hardened behavior:

| Test file | Coverage |
|-----------|---------|
| `dm-crypto.test.ts` | HKDF output format (64-char hex), HKDF determinism, HKDF domain separation (different context → different key), different secrets → different keys, `getSharedSecret` caching (SEA.secret called once), encryption/decryption via HKDF-derived key, error handling for null returns, conversation ID symmetry and format |
| `key-manager.test.ts` | Random salt is generated (not the pub key), PBKDF2 called with random salt, different salts per call, backward-compat fallback to pub key (keystore) and `backup:pub` (backup), epub cert signing, cert payload includes `ts` timestamp, error if SEA.sign returns falsy, logout clears keypair |

### Current Security Guarantees

- ✅ epub certificates prevent silent epub substitution (MITM) for new identities and any identity that has published a cert
- ✅ HKDF ensures the DM encryption key is formally derived and domain-separated from the raw ECDH shared secret
- ✅ Random salt per keystore and backup export prevents precomputed dictionary attacks on the passphrase
- ✅ All new hardening behavior is covered by automated tests
- ✅ All backward-compatibility paths are tested (legacy keystore, legacy backup, legacy identity without epub cert)

### Remaining Limitations

- ⚠️ No forward secrecy — static ECDH means the same shared secret encrypts all DMs between two users (planned: ephemeral key ratchet)
- ⚠️ epub certs are long-lived, not session-scoped — a compromised identity key could issue a new cert
- ⚠️ Legacy identities without epub certs have no MITM check on DM key exchange (graceful degradation, not rejection)
- ⚠️ No formal cryptographic audit has been conducted

### Formal Verification Recommendations

For contributors or researchers evaluating the cryptographic model:

1. **HKDF usage** (`deriveEncryptionKey` in `packages/crypto/src/dm-crypto.ts`) follows RFC 5869. The fixed salt `Nodes:v1` is not secret — it is a domain marker. The `info` string provides context binding. This is standard usage and can be analyzed against the RFC.
2. **epub cert verification** in `packages/transport-gun/src/dm-manager.ts` uses `SEA.verify`, which returns the signed payload if valid or `undefined` if not. The check `verified.epub !== epub` should be evaluated in the context of GunJS SEA's return types.
3. **PBKDF2 parameterization** (iteration count, hash): GunJS `SEA.work` internals determine these values, and no independent audit has verified them. Formal analysis of the full derivation chain requires auditing GunJS SEA's PBKDF2 implementation.

---

## GunJS Security Considerations

Nodes relies on GunJS for its P2P data layer. This comes with specific security characteristics.

### Strengths

- **SEA cryptography** is built into the protocol — signing, encryption, and key exchange are first-class operations.
- **Content-addressable data** — data in the graph is referenced by its cryptographic hash, making silent modification detectable.
- **No central authority** — there is no single server that can be compelled to hand over data or modify records.

### Limitations

- **Not formally verified.** GunJS has not undergone the same level of academic cryptographic analysis as the Signal Protocol.
- **Graph visibility.** The GunJS graph structure is readable by any connected peer. While encrypted values are opaque, the graph topology (who has data, what paths exist) is observable.
- **Eventual consistency.** GunJS uses a conflict resolution algorithm (HAM — Hypothetical Amnesia Machine) that resolves concurrent writes. In adversarial conditions, this could be exploited to cause data conflicts, though not to forge signed data.
- **Relay trust.** Relay peers are trusted for availability (message persistence and forwarding) but not for integrity (signatures prevent tampering) or confidentiality (encryption prevents reading).

---

## Voice and Video Security

### Routing modes

Voice is routed through one of two transports. Which one is used is
controlled by the user's **Voice Privacy** preference in Settings, not by
room size:

- **Privacy mode (`preferSfu = true`, the default).** The client refuses to
  connect via P2P mesh; all voice traffic must go through a LiveKit SFU.
  If no SFU is configured for the Node or the SFU join fails, the join
  errors out rather than silently exposing the user's IP.
- **P2P-allowed mode (`preferSfu = false`, opt-in).** Small rooms (up to
  `MESH_MAX_PARTICIPANTS`, currently 6) connect over WebRTC P2P mesh for
  lower latency. Larger rooms escalate to the SFU when available, or fall
  back to mesh with a quality warning if no SFU is configured.

The routing model above describes the current *client* behavior. Actually
minting SFU tokens requires a trusted server-side endpoint that is not
yet part of this release; until that lands, privacy mode surfaces a
configuration error on join rather than silently downgrading.

### WebRTC P2P mesh

- Audio/video streams are encrypted with **DTLS-SRTP** (Datagram Transport
  Layer Security for Secure Real-time Transport Protocol).
- Encryption keys are negotiated per session between peers.
- Streams flow directly between participants \u2014 no server handles
  unencrypted media.
- **IP addresses are visible** to other participants in the mesh. This is
  inherent to WebRTC P2P and is why privacy mode refuses this transport.

### LiveKit SFU

- The LiveKit SFU (Selective Forwarding Unit) routes encrypted media
  between participants.
- Streams are encrypted in transit between clients and the SFU.
- The SFU has access to media streams in order to forward them. This is a
  fundamental limitation of SFU architecture \u2014 it is not end-to-end
  encrypted.
- **IP addresses are hidden** from other participants; only the SFU sees
  each participant's IP.
- **Mitigation for SFU trust:** Communities can self-host their own
  LiveKit instance, keeping voice infrastructure under their control.
- **Token authorization:** Tokens must be minted by a trusted server-side
  endpoint. Client-side token minting is not supported because it would
  require distributing the SFU API secret to every Node member, which
  would let any member impersonate any other in a voice room.

---

## File Sharing Security

Files are shared via IPFS (InterPlanetary File System).

| Aspect | Current Implementation |
|--------|----------------------|
| Upload | Files are uploaded to an IPFS node. The resulting CID (Content Identifier) is shared in the message. |
| Access control | Anyone with the CID can retrieve the file. CIDs are shared in channel messages (public) or DMs (encrypted). |
| Persistence | Files are pinned on the server's IPFS node for availability. Without pinning, files may be garbage collected. |
| Encryption at rest | Files uploaded in DMs benefit from the CID being inside an encrypted message — but the file itself is not individually encrypted on IPFS. Anyone who obtains the CID can retrieve the file. |

### Planned Improvements

- **Client-side encryption before upload:** Encrypt files with AES-256-GCM on the client before uploading to IPFS. Only the recipient(s) with the decryption key can access the file content. This is the highest-priority security improvement.
- **Ephemeral file sharing:** Files that auto-unpin after a configurable time period.

---

## Comparison with Signal and Discord

| | Signal | Nodes | Discord |
|---|--------|-------|---------|
| **DM encryption** | E2E (Signal Protocol, formally verified) | E2E (ECDH + AES-256-GCM via GunJS SEA) | Not E2E (TLS in transit only) |
| **Forward secrecy** | Yes (Double Ratchet, per-message keys) | Not yet (static ECDH, same shared secret) | N/A (no E2E) |
| **Group encryption** | E2E (Sender Keys) | Signed, not encrypted | Not encrypted |
| **Replay protection** | Yes (sequence numbers, ratchet state) | Partial (content-addressed storage, unique IDs) | Server-managed |
| **Formal audits** | Extensive, peer-reviewed | None (beta, solo developer) | Internal corporate |
| **Metadata protection** | Sealed sender, minimal metadata | Limited — graph structure exposes patterns | Full metadata access by Discord |
| **Identity model** | Phone number required | Cryptographic keypair (no PII) | Email + phone + gov ID |
| **Data storage** | Encrypted on-device only | Encrypted on-device + encrypted in P2P graph | Plaintext on corporate servers |
| **Infrastructure** | Centralized Signal servers | Peer-to-peer with optional relays | Centralized corporate servers |
| **Key management** | Automatic, tied to phone | Manual backup required | N/A (server-managed auth) |
| **Open source** | Yes (client + server) | Yes (AGPL-3.0) | No |

### Honest Assessment

Nodes is **more private than Discord** and **less hardened than Signal**. This is the expected position for a beta product built by a solo developer.

Signal has the advantage of a decade of formal audits, a full-time cryptography team, and academic publications analyzing its protocol. Nodes has the advantage of requiring zero personal information, operating without central servers, and giving users complete ownership of their identity and data.

The goal is not to replace Signal for high-risk threat models. The goal is to provide a community platform (Discord's use case) that respects user privacy and sovereignty by default.

---

## Security Roadmap

These are planned security improvements, roughly ordered by priority.

### Near-Term

- **Forward secrecy for DMs.** Implement an ephemeral key ratchet so each message (or message chain) uses a unique encryption key derived from short-lived ECDH keypairs. Spent keys are deleted, ensuring past messages cannot be decrypted if a long-term key is later compromised. This is the single highest-priority cryptographic improvement.
- **Replay protection.** Add a monotonic sequence number or channel-scoped nonce to the signed message payload, allowing clients to detect and reject replayed messages placed in unintended graph contexts.
- **Client-side file encryption.** Encrypt files before IPFS upload so that CID possession alone does not grant access.
- **Key rotation mechanism.** Allow users to rotate their keypair and broadcast a signed migration notice linking old and new identities.
- **Encrypted channel option.** E2E encryption for channels where confidentiality is required, using group key management.

### Medium-Term

- **Metadata reduction.** Investigate techniques to reduce graph-level metadata exposure, such as mixing, batching, or pseudonymous routing.
- **Social key recovery.** Split keypair backup across multiple trusted contacts using Shamir's Secret Sharing, allowing recovery without a single backup.
- **Community security audit.** Publish the cryptographic model in sufficient detail for community review, and invite independent security researchers to evaluate it.

### Long-Term

- **Tor/anonymizing network integration.** Route relay connections through Tor or I2P to protect IP addresses.
- **Formal protocol specification.** Document the full cryptographic protocol (key exchange, message encryption, signing, graph structure) in a format suitable for academic analysis.
- **Formal security audit.** Engage a professional security firm to audit the cryptographic implementation and P2P architecture.

---

## Responsible Disclosure

If you discover a security vulnerability in Nodes, please report it responsibly.

- **Email:** security@leveq.dev
- **Do not** open a public GitHub issue for security vulnerabilities.
- I will acknowledge receipt within 48 hours and work with you on a fix before public disclosure.

---

## Summary

Nodes provides meaningful security and privacy improvements over centralized platforms like Discord:

- ✅ No personal information is collected or stored.
- ✅ DMs are end-to-end encrypted (ECDH + HKDF + AES-256-GCM).
- ✅ epub certificate binding prevents relay-level MITM substitution of DM encryption keys (for identities with a published cert).
- ✅ Keystore and backup files are encrypted with PBKDF2 using a unique random salt per file — dictionary and rainbow-table attacks on passphrases are significantly harder.
- ✅ All messages are cryptographically signed.
- ✅ Identity is self-sovereign — no corporation controls your account.
- ✅ The codebase is open source and auditable.
- ✅ All cryptographic hardening is covered by automated tests.

Nodes does not yet match the hardened security posture of Signal:

- ⚠️ No formal cryptographic audit has been conducted.
- ⚠️ DM encryption does not yet implement forward secrecy (static ECDH, no ratcheting).
- ⚠️ Metadata exposure is higher than Signal.
- ⚠️ GunJS has not been formally verified.
- ⚠️ Voice channels using LiveKit SFU are not end-to-end encrypted.
- ⚠️ Legacy identities without epub certs have no MITM check on DM key exchange.

This document will be updated as the security model evolves. Transparency is not a weakness — it is the foundation of trust.

---

## PR #45 Oversight (fixed in PR #47)

PR #45 introduced two regressions that were corrected in a follow-up:

- **Breaking key derivation change:** The HKDF key derivation change was applied to encryption but not matched with a decryption fallback, silently breaking all existing DM message history and DM notifications. A backwards-compatible fallback was added to `DMCrypto.decryptMessage()` and `ProfileCrypto.decryptField()`: the new HKDF-derived key is tried first; if decryption fails, the legacy raw ECDH key (pre-HKDF) is used as a fallback. This fallback can be removed once all messages have been re-encrypted with the new key format.

- **`publishEpubCert()` never wired at login:** `publishEpubCert()` was implemented in PR #45 but never called during login, identity creation, or backup import — so no user ever actually published their `_epubCert` to the Gun graph. Additionally, `getRecipientEpub()` waited for `_epubCert` without guarding against Gun's `.once()` silently never firing on a non-existent node in relay/P2P environments, causing a 5-second stall on every DM open for any peer without an `_epubCert`. Both issues are fixed: `publishEpubCert()` is now called at login, identity creation, and backup import; and `getRecipientEpub()` has a 2-second secondary timeout that unblocks epub resolution if the cert node never responds.

---

*"There's nothing to breach because there's nothing to store."*
