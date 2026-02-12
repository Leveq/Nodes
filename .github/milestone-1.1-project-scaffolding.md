# MILESTONE 1.1 — PROJECT SCAFFOLDING

## Nodes: Decentralized Communication Platform

---

### OBJECTIVE

Scaffold a Tauri v2 + React 19 + TypeScript + Vite monorepo for the Nodes desktop application. The end result is a launchable desktop app with hot reload, linting, formatting, and a production build that produces an installable binary.

---

### DEFINITION OF DONE

- [ ] App launches as a native desktop window with a React frontend
- [ ] Hot reload works for both React frontend and Tauri Rust backend
- [ ] Production build produces an installable binary (`.msi` for Windows, `.dmg` for macOS, `.AppImage`/`.deb` for Linux)
- [ ] Linting (ESLint + Clippy) and formatting (Prettier + rustfmt) are configured and passing
- [ ] All placeholder tests pass (Vitest for frontend, cargo test for Rust)
- [ ] Monorepo structure matches the architecture spec (Section 5)
- [ ] CI-ready: `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm build` all exit cleanly

---

### ARCHITECTURE CONTEXT

This project uses a **monorepo** structure. The desktop app is the primary target for Phase 1. Web (Phase 3) and mobile (Phase 4) targets will be added later but the structure should accommodate them from day one.

**Runtime:** Tauri v2 (Rust backend, webview frontend)
**Frontend:** React 19, TypeScript 5.x, Vite
**State Management:** Zustand (install now, configure in Milestone 1.2)
**Styling:** Tailwind CSS v4
**Package Manager:** pnpm with workspaces
**Testing:** Vitest (unit) + Playwright (E2E, configured later)
**Linting:** ESLint 9 (flat config) + Clippy (Rust)
**Formatting:** Prettier + rustfmt

---

### STEP-BY-STEP INSTRUCTIONS

#### 1. INITIALIZE MONOREPO ROOT

Create the root `package.json` with pnpm workspaces:

```
nodes/
├── package.json          # Root workspace config
├── pnpm-workspace.yaml   # Workspace definitions
├── .gitignore
├── .prettierrc
├── .eslintrc.js          # ESLint flat config (eslint.config.js)
├── tsconfig.base.json    # Shared TypeScript config
└── README.md
```

**pnpm-workspace.yaml:**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

**Root package.json scripts:**

```json
{
  "name": "nodes",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter @nodes/desktop dev",
    "build": "pnpm --filter @nodes/desktop build",
    "lint": "pnpm -r lint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "pnpm -r test",
    "clean": "pnpm -r clean"
  }
}
```

#### 2. CREATE SHARED TYPESCRIPT CONFIG

**tsconfig.base.json** at the root — all packages extend this:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

#### 3. SCAFFOLD DESKTOP APP (apps/desktop)

Use `pnpm create tauri-app` or manually scaffold:

```
apps/desktop/
├── package.json            # @nodes/desktop
├── tsconfig.json           # Extends ../../tsconfig.base.json
├── vite.config.ts
├── index.html
├── src/
│   ├── main.tsx            # React entry point
│   ├── App.tsx             # Root component
│   ├── App.css             # Temporary base styles (Tailwind replaces later)
│   ├── styles/
│   │   └── globals.css     # Tailwind directives
│   └── vite-env.d.ts       # Vite type declarations
├── src-tauri/
│   ├── Cargo.toml          # Rust dependencies
│   ├── tauri.conf.json     # Tauri v2 configuration
│   ├── src/
│   │   ├── main.rs         # Tauri entry point (do NOT use lib.rs pattern)
│   │   └── commands/       # Tauri IPC commands (empty mod for now)
│   │       └── mod.rs
│   ├── icons/              # App icons (use Tauri defaults for now)
│   └── capabilities/       # Tauri v2 capability permissions
│       └── default.json
└── tests/
    └── setup.ts            # Vitest setup
```

**Tauri v2 specific notes:**

- Tauri v2 uses a capability-based permission system. Create a default capability that grants basic window and path permissions.
- Use `tauri::Builder::default()` in main.rs. Do NOT use the `lib.rs` + `main.rs` split pattern — keep it simple.
- Set the `identifier` in tauri.conf.json to `com.nodes.desktop`
- Set `title` to `Nodes`
- Set `width` to 1280, `height` to 800, `minWidth` to 940, `minHeight` to 560

**vite.config.ts:**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
```

**Cargo.toml dependencies:**

```toml
[package]
name = "nodes-desktop"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = [] }
tauri-build = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[build-dependencies]
tauri-build = { version = "2", features = [] }
```

**main.rs starter:**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Nodes");
}
```

**commands/mod.rs:**

```rust
// Tauri IPC commands will be registered here in future milestones.
// Example pattern:
// #[tauri::command]
// pub fn greet(name: &str) -> String {
//     format!("Hello, {}! Welcome to Nodes.", name)
// }
```

#### 4. SCAFFOLD SHARED PACKAGES

Create placeholder packages that will be fleshed out in later milestones:

```
packages/
├── core/
│   ├── package.json        # @nodes/core
│   ├── tsconfig.json
│   └── src/
│       └── index.ts        # Export placeholder types
├── transport/
│   ├── package.json        # @nodes/transport
│   ├── tsconfig.json
│   └── src/
│       └── index.ts        # Transport abstraction interfaces (placeholder)
├── transport-gun/
│   ├── package.json        # @nodes/transport-gun
│   ├── tsconfig.json
│   └── src/
│       └── index.ts        # GunJS adapter (placeholder)
├── ui/
│   ├── package.json        # @nodes/ui
│   ├── tsconfig.json
│   └── src/
│       └── index.ts        # Shared React components (placeholder)
└── crypto/
    ├── package.json        # @nodes/crypto
    ├── tsconfig.json
    └── src/
        └── index.ts        # Encryption utilities (placeholder)
```

Each package.json should follow this pattern:

```json
{
  "name": "@nodes/core",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "lint": "eslint src/",
    "test": "vitest run",
    "clean": "rm -rf dist"
  }
}
```

**packages/core/src/index.ts — Starter types:**

```typescript
// Core types for the Nodes platform
// These will be expanded in subsequent milestones

export interface User {
  publicKey: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  status: UserStatus;
  visibility: AccountVisibility;
}

export type UserStatus = "online" | "idle" | "dnd" | "offline";

export type AccountVisibility = "public" | "private";

export type FieldVisibility = "public" | "friends" | "node-members" | "nobody" | "custom";

export interface ProfileField<T = string> {
  value: T;
  visibility: FieldVisibility;
}

export interface Node {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  owner: string; // publicKey
}

export interface Channel {
  id: string;
  name: string;
  type: "text" | "voice";
  topic?: string;
  nodeId: string;
}

export interface Message {
  id: string;
  content: string;
  timestamp: number;
  authorKey: string; // publicKey
  channelId: string;
  type: "text" | "system" | "file";
}
```

**packages/transport/src/index.ts — Transport abstraction interfaces:**

```typescript
// Transport Abstraction Layer (TAL)
// Protocol-agnostic interfaces that decouple the app from any specific P2P technology.
// See Architecture Spec Section 2.3

import type { Message, User, UserStatus } from "@nodes/core";

export type Unsubscribe = () => void;
export type MessageHandler = (message: Message) => void;
export type PresenceHandler = (userId: string, status: UserStatus) => void;

export interface HistoryOpts {
  limit?: number;
  before?: number; // timestamp
  after?: number; // timestamp
}

export interface IMessageTransport {
  send(channel: string, message: Message): Promise<void>;
  subscribe(channel: string, cb: MessageHandler): Unsubscribe;
  getHistory(channel: string, opts: HistoryOpts): Promise<Message[]>;
}

export interface IPresenceTransport {
  setStatus(status: UserStatus): Promise<void>;
  onPresenceChange(cb: PresenceHandler): Unsubscribe;
}

export interface KeyPair {
  pub: string;
  priv: string;
  epub: string;
  epriv: string;
}

export interface Session {
  user: User;
  keypair: KeyPair;
}

export interface IAuthProvider {
  createIdentity(): Promise<KeyPair>;
  authenticate(keypair: KeyPair): Promise<Session>;
  encrypt(data: string, recipientPub: string): Promise<string>;
  decrypt(data: string): Promise<string>;
}

export interface IFileTransport {
  upload(file: File, encrypt?: boolean): Promise<string>; // returns CID or reference
  download(ref: string): Promise<Blob>;
  delete(ref: string): Promise<void>;
}
```

#### 5. CONFIGURE TAILWIND CSS v4

Install in the desktop app:

```bash
cd apps/desktop
pnpm add -D tailwindcss @tailwindcss/vite
```

**Update vite.config.ts** to add the Tailwind plugin:

```typescript
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ... rest of config
});
```

**src/styles/globals.css:**

```css
@import "tailwindcss";

/* Nodes theme tokens — will expand in UI milestone */
@theme {
  --color-nodes-bg: #1a1a2e;
  --color-nodes-surface: #16213e;
  --color-nodes-primary: #6c63ff;
  --color-nodes-primary-light: #8b80ff;
  --color-nodes-text: #e4e4e7;
  --color-nodes-text-muted: #71717a;
  --color-nodes-border: #27273a;
  --color-nodes-accent: #34d399;
  --color-nodes-danger: #ef4444;
}
```

#### 6. CONFIGURE ESLINT 9 (FLAT CONFIG)

**eslint.config.js** at the root:

```javascript
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/src-tauri/**"],
  },
);
```

#### 7. CONFIGURE PRETTIER

**.prettierrc** at the root:

```json
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 100,
  "bracketSpacing": true,
  "arrowParens": "always"
}
```

**.prettierignore:**

```
node_modules
dist
target
src-tauri/target
*.lock
```

#### 8. CONFIGURE VITEST

Install at root:

```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

**vitest.config.ts** in apps/desktop:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

**tests/setup.ts:**

```typescript
import "@testing-library/jest-dom";
```

Create a placeholder test — **src/App.test.tsx:**

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import App from "./App";

describe("App", () => {
  it("renders the Nodes app", () => {
    render(<App />);
    expect(screen.getByText(/Nodes/i)).toBeInTheDocument();
  });
});
```

#### 9. CREATE PLACEHOLDER APP COMPONENT

**src/App.tsx:**

```tsx
import "./styles/globals.css";

function App() {
  return (
    <div className="h-screen w-screen bg-nodes-bg text-nodes-text flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-nodes-primary mb-4">Nodes</h1>
        <p className="text-nodes-text-muted text-lg">Decentralized communication, owned by you.</p>
        <p className="text-nodes-text-muted text-sm mt-8 opacity-50">
          v0.1.0-alpha — Milestone 1.1
        </p>
      </div>
    </div>
  );
}

export default App;
```

**src/main.tsx:**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

**index.html:**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Nodes</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

#### 10. SCAFFOLD INFRASTRUCTURE DIRECTORY

```
infrastructure/
├── relay/
│   └── README.md           # "GunJS relay peer — configured in Phase 2"
├── livekit/
│   └── README.md           # "LiveKit server config — configured in Phase 2"
└── turn/
    └── README.md           # "coturn STUN/TURN — configured in Phase 2"
```

#### 11. CREATE ROOT FILES

**.gitignore:**

```
node_modules/
dist/
target/
*.lock
!pnpm-lock.yaml
.DS_Store
*.local
.env
.env.*
```

**README.md:**

````markdown
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
````

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

```

---

### VERIFICATION CHECKLIST

After scaffolding, verify each of these:

1. **`pnpm install`** — Completes without errors
2. **`pnpm dev`** — Opens a native Tauri window displaying the Nodes splash screen
3. **Hot reload** — Edit App.tsx text, confirm it updates in the window without restart
4. **`pnpm build`** — Produces a platform binary in `apps/desktop/src-tauri/target/release/bundle/`
5. **`pnpm test`** — Placeholder test passes
6. **`pnpm lint`** — No errors
7. **`pnpm format:check`** — All files formatted
8. **`cargo clippy`** — No warnings in `apps/desktop/src-tauri/`
9. **Binary size** — Development build should be under 20MB
10. **Memory usage** — Idle app should use less than 100MB RAM

---

### NEXT MILESTONE

Once 1.1 is verified, proceed to **Milestone 1.2: Identity System** which will implement:
- GunJS SEA keypair generation
- Local encrypted keystore
- User profile creation (self-sovereign model from Spec Section 2.7)
- Public/private account selection
- Login/restore flow
```
