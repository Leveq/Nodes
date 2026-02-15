# Changelog

All notable changes to Nodes will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0-alpha] - 2026-02-15

### Added

**Milestone 2.3 — Roles & Permissions**
- Role system with customizable colors and names
- Granular permissions (manage channels, kick/ban, manage roles, etc.)
- Role hierarchy for permission inheritance
- Admin role auto-assigned to Node creators
- Member list sorted by role hierarchy
- Role color display on usernames in chat
- Permission-gated UI (buttons hidden if no permission)

**Milestone 2.4 — Voice Channels**
- P2P WebRTC voice chat via mesh topology
- Real-time speaking indicators (neon blue ring)
- Audio level detection with dB threshold
- Mute/deafen controls with keyboard shortcuts (Ctrl+Shift+M/D)
- Voice channel participant list (visible without joining)
- Automatic peer connection management
- ICE candidate queuing for reliable connections
- Heartbeat-based presence for voice channels
- Gun signaling for WebRTC offer/answer/ICE exchange

**Infrastructure**
- Staging environment at nodes-staging.leveq.dev
- Automated staging deployment script
- Gun relay at nodesrelay.leveq.dev

### Fixed
- Speaking indicator debounce logic (was never firing)
- Gun subscription loops causing browser freeze
- ICE candidates arriving before SDP offer processed
- Stale signaling messages being replayed
- History marks persisting incorrectly on old channels

### Changed
- Voice uses direct P2P mesh (no server required for small groups)
- Speaking detection uses RMS-based audio analysis
- Debounced state emission to prevent UI flickering

## [0.2.0-alpha] - 2026-02-14

### Added

**Milestone 2.1 — File Sharing**
- IPFS file storage via Helia (in-browser node)
- Drag-and-drop file uploads in channels and DMs
- Inline image rendering with thumbnails
- Image lightbox viewer with zoom and download
- Profile avatars stored on IPFS
- File attachment previews with type icons
- Image compression and thumbnail generation

**Milestone 2.2 — Message Enhancements**
- Emoji reactions on messages (any emoji, P2P sync)
- Reply/quote messages with clickable references
- Markdown rendering (bold, italic, strikethrough, code, lists, blockquotes)
- Syntax highlighting for code blocks (JS, TS, Python, Rust, etc.)
- Link previews with OpenGraph metadata
- YouTube embeds with video thumbnails
- Message editing with "(edited)" indicator
- Message deletion (soft-delete, shows "[Message deleted]")
- Right-click context menu (Reply, React, Copy, Edit, Delete)
- Hover action bar on messages

### Fixed
- Reactions now persist correctly (fixed Gun subscription model)
- Messages appear instantly for sender (optimistic updates)
- Channel subscriptions maintained when navigating to DMs
- Removed dead Gun relay peers

### Changed
- Upgraded to cascading Gun subscriptions for real-time reaction sync
- Message IDs now generated client-side for optimistic updates

## [0.1.0-alpha] - 2026-01-15

### Added

**Phase 1 — Foundation**
- Self-sovereign identity with cryptographic keypairs
- Encrypted local keystore with password protection
- Identity backup and restore (JSON export)
- Community Nodes with text channels
- Invite link system for joining Nodes
- Real-time P2P messaging via GunJS
- Message grouping and timestamps
- Typing indicators
- End-to-end encrypted DMs (ECDH + AES-256)
- Friend request/accept system
- Presence status (online, idle, DND, invisible)
- Heartbeat-based presence detection
- User profiles with editable fields
- Per-field visibility controls (public/friends/nobody)
- Native Tauri desktop app (~15MB binary)
- System tray with minimize-to-tray
- Dark theme UI

### Technical
- Transport abstraction layer (protocol-agnostic interfaces)
- GunJS adapter for P2P sync
- SEA cryptography (ECDSA signing, ECDH key exchange)
- Zustand state management
- React 19 with TypeScript
- Tailwind CSS styling

---

[unreleased]: https://github.com/Leveq/Nodes/compare/v0.4.0-alpha...HEAD
[0.4.0-alpha]: https://github.com/Leveq/Nodes/compare/v0.2.0-alpha...v0.4.0-alpha
[0.2.0-alpha]: https://github.com/Leveq/Nodes/compare/v0.1.0-alpha...v0.2.0-alpha
[0.1.0-alpha]: https://github.com/Leveq/Nodes/releases/tag/v0.1.0-alpha
