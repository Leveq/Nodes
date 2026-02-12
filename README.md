# Nodes

**Open-source, decentralized Discord alternative where users own and serve their own identity — no servers, no corporate middlemen, just math.**

## Architecture

- **Desktop:** Tauri v2 (Rust) + React 19 + TypeScript
- **P2P Data:** GunJS (real-time sync, SEA encryption)
- **Voice/Video:** LiveKit + WebRTC
- **File Storage:** IPFS
- **Identity:** Self-Sovereign — users serve their own profile data via cryptographic keypairs

## Development

```bash
# Install dependencies
pnpm install

# Run desktop app in development
pnpm dev

# Build for production
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Format
pnpm format
```

## Project Structure

```
nodes/
├── apps/
│   └── desktop/          # Tauri v2 desktop app
├── packages/
│   ├── core/             # Shared types & business logic
│   ├── transport/        # Transport abstraction layer
│   ├── transport-gun/    # GunJS adapter
│   ├── ui/               # Shared React components
│   └── crypto/           # Encryption utilities
├── infrastructure/       # Relay, LiveKit, TURN configs
└── docs/                 # Documentation & ADRs
```

## License

TBD — See Architecture Spec Section 8 (Open Questions)
