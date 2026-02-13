# Nodes

**Open-source, decentralized Discord alternative where users own and serve their own identity — no servers, no corporate middlemen, just math.**

---

Your identity is a cryptographic keypair generated on your device. Your profile data lives in your own graph, signed by your keys, served peer-to-peer. Messages sync in real-time without central servers. DMs are end-to-end encrypted — not even relay peers can read them. Nobody owns your data because nobody has it but you.

## Why Nodes?

Discord now requires government ID verification. Their 2025 data breach exposed millions of those IDs. Users are being asked to hand over more personal data to a platform that already proved it can't protect what it has.

Nodes takes a different approach: **there's nothing to breach because there's nothing to store.** Identity is cryptography, not a database row. Communication is peer-to-peer, not routed through corporate infrastructure. Privacy isn't a policy — it's architecture.

## What Works Today (v0.1.0-alpha)

- **Self-sovereign identity** — Keypair-based identity with encrypted local keystore and backup/restore
- **Community Nodes** — Create or join communities with invite links, text channels, and member management
- **Real-time messaging** — P2P text chat with message grouping, timestamps, history, and typing indicators
- **E2E encrypted DMs** — ECDH key exchange, messages encrypted before they touch the network
- **Friend system** — Request/accept flow gates all DMs — no unsolicited messages
- **Presence** — Online/idle/DND/invisible status with heartbeat
- **Profile system** — Editable profiles with per-field visibility controls (public/friends/nobody)
- **Desktop app** — Native Tauri binary with system tray (~15MB, ~80MB RAM)

## Screenshots

[Nodes](./.github/docs/Screenshots/nodesscreenshot01.png)

<!-- Add your screenshots here -->
<!-- ![Nodes Chat](./docs/screenshots/chat.png) -->
<!-- ![Profile Popup](./docs/screenshots/profile.png) -->

## Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Desktop | Tauri v2 (Rust) + React 19 + TypeScript | Native app, ~15MB binary |
| P2P Data | GunJS + SEA | Real-time sync, cryptographic auth |
| Identity | Self-Sovereign (SSI) | Users serve their own profile via keypair |
| Encryption | SEA (ECDSA + ECDH + AES-256) | Signing, key exchange, E2E encryption |
| Voice/Video | LiveKit + WebRTC | Coming in Phase 2 |
| File Storage | IPFS (Helia) | Coming in Phase 2 |

**Transport Abstraction Layer:** The app never touches GunJS directly. All P2P operations go through protocol-agnostic interfaces, so the underlying transport can be swapped without rewriting the UI or business logic.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 8+
- [Rust](https://rustup.rs/) (for Tauri)

### Development

```bash
# Clone
git clone https://github.com/Leveq/Nodes.git
cd Nodes

# Install dependencies
pnpm install

# Run desktop app in development
pnpm dev

# Build for production
pnpm tauri build

# Run tests
pnpm test

# Lint & format
pnpm lint
pnpm format
```

## Project Structure

```
nodes/
├── apps/
│   └── desktop/              # Tauri v2 desktop app
│       └── src-tauri/        # Rust backend (system tray, commands)
├── packages/
│   ├── core/                 # Shared types & interfaces
│   ├── transport/            # Transport abstraction layer (interfaces)
│   ├── transport-gun/        # GunJS adapter (messaging, presence, profiles, nodes)
│   ├── crypto/               # Key management, profile encryption, DM encryption
│   └── ui/                   # Shared React components
├── infrastructure/           # Relay, LiveKit, TURN configs
└── scripts/                  # Build & dev utilities
```

## Roadmap

### Phase 1 — Foundation ✅
Identity, messaging, communities, DMs, friends, presence, profiles, desktop app.

### Phase 2 — Competitive Features (In Progress)
Voice/video channels, file sharing (IPFS), roles & permissions, moderation tools, message reactions/replies/threads, search.

### Phase 3 — Platform Expansion
Web client (PWA), plugin/bot system, Node discovery, notifications, theming.

### Phase 4 — Scale
Mobile (React Native), federation, self-hosting toolkit, performance hardening.

## How It's Different

| | Discord | Matrix/Element | Nodes |
|---|---------|---------------|-------|
| Identity | Email + phone + gov ID | Email + homeserver | Cryptographic keypair (no PII) |
| Data ownership | Discord owns everything | Homeserver admin owns it | **You own it** |
| Encryption | None (channels), partial (DMs) | Optional E2E | **E2E by default (DMs)** |
| Infrastructure | Centralized servers | Federated servers | **Peer-to-peer** |
| Cost to run | Free (you are the product) | Server hosting costs | **$0 — users are the network** |
| Bans | Platform can erase your identity | Server admin can ban | **Node bans don't delete your identity** |

## Contributing

Nodes is early-stage alpha. If you're interested in contributing, open an issue to discuss before submitting a PR. Areas where help is most needed:

- WebRTC/LiveKit voice implementation
- IPFS file sharing integration
- Automated test coverage
- UI/UX design and polish
- Security auditing

## License

[AGPL-3.0](LICENSE) — You're free to use, modify, and distribute Nodes. If you deploy a modified version, you must share your changes under the same license.

---

*Communication should be decentralized, encrypted, and owned by the people who use it.*