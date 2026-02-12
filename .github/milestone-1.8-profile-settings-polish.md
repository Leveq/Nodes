# MILESTONE 1.8 — PROFILE, SETTINGS & DESKTOP POLISH
## Nodes: Decentralized Communication Platform
## ⚡ PHASE 1 FINALE — First Installable Build ⚡

---

### OBJECTIVE
Complete the user experience layer. Users can edit their profiles, change their status, view other users' profiles, and manage their account settings. Then produce the first real installable binary — app icon, proper metadata, system tray, and a build pipeline that outputs .msi (Windows), .dmg (macOS), and .AppImage (Linux). When this milestone is done, you can hand someone Nodes and they can install it, create an identity, join a community, chat in channels, DM friends, and manage their profile. Phase 1 complete.

---

### DEFINITION OF DONE

**Profile:**
- [ ] User can edit display name, bio, and status message from a profile panel
- [ ] Profile changes sync to GunJS user graph immediately
- [ ] Status selector dropdown: Online, Idle, Do Not Disturb, Invisible
- [ ] Status selection persists across sessions (stored in user graph)
- [ ] Clicking any user's name/avatar anywhere in the app shows a profile popup
- [ ] Profile popup shows: avatar placeholder, display name, status, bio, account type, mutual Nodes, friend status
- [ ] Profile popup has action buttons: Send Message / Add Friend / Block (contextual)

**Settings:**
- [ ] Settings page accessible from user panel in sidebar (gear icon)
- [ ] Account section: change passphrase, export keypair backup, view public key
- [ ] Privacy section: toggle account visibility (public/private), manage per-field visibility
- [ ] Social section: friend list management, blocked users list with unblock
- [ ] Appearance section: placeholder for future theme customization
- [ ] About section: version number, links to repo/docs, Nodes philosophy blurb
- [ ] Settings changes save immediately with confirmation toast

**Desktop Polish:**
- [ ] App icon (custom Nodes icon for taskbar, title bar, system tray)
- [ ] Proper window title: "Nodes" (not "Tauri App" or localhost)
- [ ] Tauri app metadata: identifier, version, description, author
- [ ] Production build produces installable binaries (.msi, .dmg, .AppImage)
- [ ] Binary size under 20MB
- [ ] Idle memory under 100MB
- [ ] Window minimum size enforced (940×560)
- [ ] System tray icon with basic menu (Show/Hide, Quit)
- [ ] Graceful shutdown: set presence offline, clean up subscriptions on app close
- [ ] Keyboard shortcut: Ctrl/Cmd+, opens Settings
- [ ] Keyboard shortcut: Escape closes modals/panels

---

### STEP-BY-STEP INSTRUCTIONS

#### 1. USER PROFILE PANEL

**apps/desktop/src/components/profile/ProfilePanel.tsx:**

A slide-out panel (or modal) for editing the current user's profile. Accessible from clicking your own name/avatar in the status bar or sidebar user panel.

```
┌────────────────────────────────────────┐
│  Edit Profile                     [✕]  │
├────────────────────────────────────────┤
│                                        │
│         ┌──────────┐                   │
│         │          │                   │
│         │  Avatar  │  [Change] (P2)    │
│         │  (K)     │                   │
│         └──────────┘                   │
│                                        │
│  Display Name                          │
│  ┌──────────────────────────────────┐  │
│  │ kdogg                        24/32│  │
│  └──────────────────────────────────┘  │
│                                        │
│  Bio                                   │
│  ┌──────────────────────────────────┐  │
│  │ Full-stack dev building the      │  │
│  │ future of decentralized comms.   │  │
│  │                            86/256│  │
│  └──────────────────────────────────┘  │
│                                        │
│  Status Message                        │
│  ┌──────────────────────────────────┐  │
│  │ Working on Nodes 🚀          24/64│  │
│  └──────────────────────────────────┘  │
│                                        │
│  Account Type                          │
│  ┌─────────┐ ┌─────────┐              │
│  │ Public  │ │ Private │              │
│  └─────────┘ └─────────┘              │
│                                        │
│           [Save Changes]               │
│                                        │
└────────────────────────────────────────┘
```

**Implementation notes:**
- Use the existing Input component for fields
- Character counters on all fields (display name: 32, bio: 256, status message: 64)
- Avatar shows first letter of display name in a colored circle. "Change" button is disabled with "(Phase 2)" tooltip — actual avatar upload requires IPFS
- Save writes to profile via `profileManager.saveProfile()` from Milestone 1.2
- Debounce save or use explicit Save button (explicit button is better UX for profile edits)
- On save success: toast "Profile updated", close panel

#### 2. STATUS SELECTOR

**apps/desktop/src/components/profile/StatusSelector.tsx:**

A dropdown attached to the status dot in the user panel (bottom of channel sidebar or status bar).

```
┌──────────────────────┐
│  ● Online            │  ← green dot
│  ◐ Idle              │  ← yellow dot (half circle)
│  ⊘ Do Not Disturb    │  ← red dot
│  ○ Invisible         │  ← gray/hollow dot
├──────────────────────┤
│  Set Status Message  │  ← opens small input
└──────────────────────┘
```

**Behavior:**
- Click the status dot → dropdown opens above it (positioned upward since it's at the bottom)
- Selecting a status: calls `presence.setStatus(status)` via transport
- The status persists to the user's Gun graph so it restores on next login
- "Invisible" sets presence to "offline" from others' perspective while the user remains logged in
- "Do Not Disturb" is a visual indicator for now (future: suppress notifications)
- "Set Status Message" opens a small inline input — value stored in profile, shown in profile popup
- Status selector closes on selection or outside click

**Status dot colors (use consistently everywhere):**
```
online:    bg-green-500
idle:      bg-yellow-500
dnd:       bg-red-500
invisible: bg-gray-500 (ring-1 ring-gray-400, hollow look)
offline:   bg-gray-600
```

#### 3. PROFILE POPUP (USER CARD)

**apps/desktop/src/components/profile/ProfilePopup.tsx:**

Shown when clicking ANY user's name or avatar throughout the app (member list, message author, DM header, friend list).

```
┌──────────────────────────────────┐
│  ┌──────┐                        │
│  │  K   │  kdogg          ● Online │
│  │      │  Public                │
│  └──────┘                        │
├──────────────────────────────────┤
│                                  │
│  ABOUT ME                        │
│  Full-stack dev building the     │
│  future of decentralized comms.  │
│                                  │
│  STATUS                          │
│  🚀 Working on Nodes             │
│                                  │
│  MEMBER SINCE                    │
│  February 2026                   │
│                                  │
│  MUTUAL NODES                    │
│  Test Node, Dev Node             │
│                                  │
├──────────────────────────────────┤
│  [Send Message] [···]            │
│                                  │
│  ··· menu:                       │
│    Add Friend / Unfriend         │
│    Block User                    │
│    Copy Public Key               │
└──────────────────────────────────┘
```

**Implementation:**
- Floating card positioned near the clicked element (use `position: fixed` with calculated coordinates)
- Closes on outside click or Escape
- Profile data resolved via `profileManager.getPublicProfile(publicKey)` for other users, or from identity store for self
- "Send Message" goes through `socialStore.initiateMessage()` (respects friend gating)
- "Mutual Nodes" computed by comparing the target user's Node memberships with your own
- For yourself: show "Edit Profile" button instead of Send Message / Add Friend
- Presence dot reflects real-time status (use the presence subscription)

#### 4. SETTINGS PAGE

**apps/desktop/src/components/settings/SettingsPage.tsx:**

A full-page overlay (or dedicated route within AppShell) for all user settings.

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Back                                    Settings              │
├──────────┬───────────────────────────────────────────────────────┤
│          │                                                       │
│ Account  │  ACCOUNT                                              │
│ Privacy  │                                                       │
│ Social   │  Public Key                                           │
│ Appear.  │  qt1BMyFL...fjoh0Mh8                         [Copy]  │
│ About    │                                                       │
│          │  Change Passphrase                                    │
│          │  ┌────────────────────────────────────────┐           │
│          │  │ Current passphrase                     │           │
│          │  └────────────────────────────────────────┘           │
│          │  ┌────────────────────────────────────────┐           │
│          │  │ New passphrase                         │           │
│          │  └────────────────────────────────────────┘           │
│          │  ┌────────────────────────────────────────┐           │
│          │  │ Confirm new passphrase                 │           │
│          │  └────────────────────────────────────────┘           │
│          │  [Update Passphrase]                                  │
│          │                                                       │
│          │  Export Keypair Backup                                 │
│          │  Save your identity to a file so you can              │
│          │  restore it on another device.                         │
│          │  [Export Backup]                                       │
│          │                                                       │
│          │  ─────────────────────────────────────────            │
│          │  DANGER ZONE                                          │
│          │                                                       │
│          │  Delete Identity                                      │
│          │  This clears your local keystore. Your identity       │
│          │  still exists in the network — restore it from a      │
│          │  backup at any time. Without a backup, your           │
│          │  identity is lost permanently.                        │
│          │  [Delete Local Identity]                              │
│          │                                                       │
└──────────┴───────────────────────────────────────────────────────┘
```

**Settings Sections:**

**Account:**
- Public key display with copy button
- Change passphrase form (current + new + confirm)
  - Validates current passphrase by attempting to decrypt keystore
  - Re-encrypts keystore with new passphrase
  - Toast: "Passphrase updated"
- Export backup (reuses existing `keyManager.exportBackup()`)
  - Opens a save dialog (or downloads a .json file)
  - File named: `nodes-backup-{truncatedPubKey}-{date}.json`
- Delete identity (danger zone)
  - Confirmation modal: "Type DELETE to confirm"
  - Clears localStorage keystore
  - Sets presence to offline
  - Redirects to CreateIdentity screen

**Privacy:**
- Account visibility toggle (Public / Private)
  - Changing from public to private: encrypts all non-public fields
  - Changing from private to public: decrypts fields to public visibility
  - Warning toast when switching: "This will change who can see your profile information"
- Per-field visibility table:
  ```
  Field           Visibility
  Display Name    [Public ▾]      ← always public (locked, with explanation)
  Bio             [Public ▾] / [Friends ▾] / [Nobody ▾]
  Status          [Public ▾] / [Friends ▾] / [Nobody ▾]
  Avatar          [Public ▾] / [Friends ▾] / [Nobody ▾]
  ```
- Each field has a dropdown to set visibility level
- Changes save immediately via `profileManager.updateField()`

**Social:**
- Friend list with unfriend buttons
  - Each friend: avatar, name, presence dot, [Unfriend] button
  - Unfriend confirmation: "Remove {name} as a friend? You won't be able to DM each other."
- Blocked users list with unblock buttons
  - Each blocked user: name/key, block date, [Unblock] button
- Pending outgoing requests with cancel buttons

**Appearance (placeholder):**
- "Theme customization coming soon"
- Maybe a toggle for compact vs comfortable message display (stretch goal)

**About:**
- Nodes logo
- Version: "v0.1.0-alpha — Phase 1"
- "Open-source decentralized communication"
- Link to GitHub repo (placeholder URL)
- Build info: Tauri version, platform
- The Nodes philosophy:
  > "Communication should be decentralized, encrypted, and owned
  > by the people who use it. Your identity is a cryptographic
  > keypair. No servers, no corporate middlemen, just math."

#### 5. CHANGE PASSPHRASE IMPLEMENTATION

Add to identity store:

```typescript
changePassphrase: async (currentPassphrase: string, newPassphrase: string) => {
  // 1. Verify current passphrase by attempting to decrypt
  const stored = localStorage.getItem("nodes:keystore");
  if (!stored) throw new Error("No keystore found.");

  const keystore = JSON.parse(stored);

  try {
    await keyManager.restoreFromLocalStore(keystore, currentPassphrase);
  } catch {
    throw new Error("Current passphrase is incorrect.");
  }

  // 2. Re-encrypt with new passphrase
  const newKeystore = await keyManager.saveToLocalStore(newPassphrase);
  localStorage.setItem("nodes:keystore", JSON.stringify(newKeystore));

  // 3. Done — keypair in memory is unchanged
}
```

#### 6. EXPORT BACKUP WITH FILE SAVE

For the desktop app, use Tauri's file dialog to let the user choose where to save:

```typescript
// In the settings handler:
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

const exportBackup = async () => {
  const backup = await identityStore.exportBackup(passphrase, label);
  const json = JSON.stringify(backup, null, 2);

  const truncatedKey = publicKey.slice(0, 8);
  const date = new Date().toISOString().split("T")[0];
  const defaultName = `nodes-backup-${truncatedKey}-${date}.json`;

  const filePath = await save({
    defaultPath: defaultName,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (filePath) {
    await writeTextFile(filePath, json);
    addToast("success", "Backup exported successfully.");
  }
};
```

**Tauri permissions needed** in `src-tauri/capabilities/default.json`:
```json
{
  "permissions": [
    "dialog:default",
    "dialog:allow-save",
    "fs:default",
    "fs:allow-write-text-file"
  ]
}
```

#### 7. DESKTOP POLISH

**App Icon:**

Create a Nodes icon. For now, a simple geometric design:
- A stylized "N" or interconnected nodes/dots forming a network pattern
- Use SVG for source, export as:
  - `icon.ico` (Windows) — 256x256, 128x128, 64x64, 32x32, 16x16
  - `icon.icns` (macOS) — standard sizes
  - `icon.png` — 512x512 for Linux and general use
  - `32x32.png`, `128x128.png`, `128x128@2x.png` for Tauri
- Place in `apps/desktop/src-tauri/icons/`

If you don't want to design one now, use a placeholder:
- A solid purple circle with "N" in white (matches the Nodes primary color)
- Generate with any icon tool or even HTML canvas → export

**Tauri Configuration (apps/desktop/src-tauri/tauri.conf.json):**

```json
{
  "productName": "Nodes",
  "version": "0.1.0",
  "identifier": "com.nodes.desktop",
  "build": {
    "frontendDist": "../dist"
  },
  "app": {
    "windows": [
      {
        "title": "Nodes",
        "width": 1200,
        "height": 800,
        "minWidth": 940,
        "minHeight": 560,
        "center": true,
        "resizable": true,
        "decorations": true
      }
    ],
    "security": {
      "csp": null
    },
    "trayIcon": {
      "id": "main-tray",
      "iconPath": "icons/icon.png",
      "tooltip": "Nodes — Decentralized Communication"
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ],
    "windows": {
      "wix": {
        "language": "en-US"
      }
    },
    "macOS": {
      "minimumSystemVersion": "10.15"
    },
    "linux": {
      "deb": {
        "depends": []
      }
    }
  }
}
```

**System Tray (Rust side):**

**apps/desktop/src-tauri/src/tray.rs:**
```rust
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Manager,
};

pub fn create_tray(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let show = MenuItem::with_id(app, "show", "Show Nodes", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
```

**Update main.rs:**
```rust
mod tray;

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            tray::create_tray(app.handle())?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error running Nodes");
}
```

#### 8. GRACEFUL SHUTDOWN

Wire up app close to clean up properly:

**Frontend (in AppShell or App.tsx):**
```typescript
import { listen } from "@tauri-apps/api/event";

useEffect(() => {
  // Listen for Tauri close event
  const unlisten = listen("tauri://close-requested", async (event) => {
    // Set offline presence
    const { presence } = useTransport();
    await (presence as GunPresenceTransport).goOffline();

    // Clean up subscriptions
    useSocialStore.getState().cleanup();
    useDMStore.getState().cleanup();

    // Allow the window to close
    const { appWindow } = await import("@tauri-apps/api/window");
    await appWindow.close();
  });

  return () => {
    unlisten.then((fn) => fn());
  };
}, []);
```

**Also handle browser tab close (for dev/web testing):**
```typescript
useEffect(() => {
  const handleBeforeUnload = () => {
    // Already wired in TransportProvider from Milestone 1.3
    // Ensure social and DM cleanup happens here too
  };

  window.addEventListener("beforeunload", handleBeforeUnload);
  return () => window.removeEventListener("beforeunload", handleBeforeUnload);
}, []);
```

#### 9. KEYBOARD SHORTCUTS

**apps/desktop/src/hooks/useKeyboardShortcuts.ts:**

```typescript
import { useEffect } from "react";

interface ShortcutMap {
  [key: string]: () => void;
}

/**
 * Global keyboard shortcut handler.
 * Use in AppShell.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutMap) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = buildShortcutKey(e);
      if (shortcuts[key]) {
        e.preventDefault();
        shortcuts[key]();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}

function buildShortcutKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("mod");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  parts.push(e.key.toLowerCase());
  return parts.join("+");
}
```

**Usage in AppShell:**
```typescript
const [showSettings, setShowSettings] = useState(false);

useKeyboardShortcuts({
  "mod+,": () => setShowSettings(true),
  "escape": () => {
    setShowSettings(false);
    // Also close any open modals/panels
  },
});
```

#### 10. NAVIGATION UPDATES

Update AppShell to support the Settings overlay:

```typescript
// AppShell.tsx
const [showSettings, setShowSettings] = useState(false);
const [showProfile, setShowProfile] = useState(false);

// In the status bar or user panel, add gear icon:
<button onClick={() => setShowSettings(true)} title="Settings (Ctrl+,)">
  <GearIcon />
</button>

// Render settings as an overlay:
{showSettings && (
  <SettingsPage onClose={() => setShowSettings(false)} />
)}

// Profile panel:
{showProfile && (
  <ProfilePanel onClose={() => setShowProfile(false)} />
)}
```

#### 11. USER PANEL (Bottom of Channel/DM Sidebar)

Refine the user panel at the bottom of the sidebar:

```
┌──────────────────────────────────────────┐
│  [K] kdogg ●        🎤  🔊  ⚙          │
│      Working on Nodes                     │
└──────────────────────────────────────────┘
```

- Avatar placeholder (clickable → opens ProfilePanel)
- Display name (clickable → opens ProfilePanel)
- Status dot (clickable → opens StatusSelector)
- Status message below name (truncated, muted text)
- Microphone icon (placeholder, grayed — voice in Phase 2)
- Speaker icon (placeholder, grayed — voice in Phase 2)
- Gear icon (opens Settings)

This panel appears at the bottom of both ChannelSidebar and DMSidebar.

---

### COMPONENT FILE STRUCTURE

```
apps/desktop/src/
├── components/
│   ├── profile/
│   │   ├── ProfilePanel.tsx         # Edit own profile
│   │   ├── ProfilePopup.tsx         # View any user's profile card
│   │   ├── StatusSelector.tsx       # Status dropdown
│   │   └── UserPanel.tsx            # Bottom sidebar user info
│   └── settings/
│       ├── SettingsPage.tsx          # Full settings overlay
│       ├── AccountSettings.tsx       # Passphrase, backup, danger zone
│       ├── PrivacySettings.tsx       # Visibility controls
│       ├── SocialSettings.tsx        # Friends, blocked users
│       ├── AppearanceSettings.tsx    # Placeholder
│       └── AboutSettings.tsx         # Version, philosophy
├── hooks/
│   └── useKeyboardShortcuts.ts
└── src-tauri/
    ├── src/
    │   ├── main.rs                   # Updated with tray
    │   └── tray.rs                   # System tray
    ├── icons/                        # App icons (all sizes)
    └── tauri.conf.json               # Updated config
```

---

### PRODUCTION BUILD CHECKLIST

After all features are implemented, run through the build:

```bash
# 1. Clean
pnpm clean  # or rm -rf apps/desktop/dist apps/desktop/src-tauri/target

# 2. Lint everything
pnpm lint

# 3. Run tests
pnpm test

# 4. Build the frontend
cd apps/desktop
pnpm build

# 5. Build the Tauri binary
pnpm tauri build

# 6. Check output
# Windows: apps/desktop/src-tauri/target/release/bundle/msi/Nodes_0.1.0_x64_en-US.msi
# macOS:   apps/desktop/src-tauri/target/release/bundle/dmg/Nodes_0.1.0_aarch64.dmg
# Linux:   apps/desktop/src-tauri/target/release/bundle/appimage/Nodes_0.1.0_amd64.AppImage

# 7. Verify binary size
ls -lh apps/desktop/src-tauri/target/release/bundle/

# 8. Install and test
# Run the installer, verify the app launches, create identity, full flow
```

---

### VERIFICATION CHECKLIST

**Profile:**
1. Edit display name → change reflected in member lists, messages, status bar
2. Edit bio → visible in own profile popup
3. Set status message → visible in user panel and profile popup
4. Change status → dot color changes everywhere (member list, status bar, profile popup)
5. Status persists → close app, reopen, status is restored
6. Profile popup on click → shows correct data for any user
7. Profile popup actions → Send Message, Add Friend, Block all work correctly

**Settings:**
8. Open settings → Ctrl+, or gear icon, page renders with all sections
9. Change passphrase → logout, login with new passphrase works, old doesn't
10. Export backup → file save dialog, .json file produced
11. Import backup on fresh install → identity restores correctly
12. Delete identity → keystore cleared, redirected to create screen
13. Toggle account visibility → field encryption changes accordingly
14. Per-field visibility → change bio to "friends only", non-friends can't see it
15. Friend list in settings → shows all friends with unfriend option
16. Blocked list in settings → shows blocked users with unblock option

**Desktop:**
17. App icon → visible in taskbar, title bar, system tray
18. Window title → "Nodes"
19. Minimum window size → can't resize below 940×560
20. System tray → icon present, right-click shows Show/Quit
21. Tray → clicking "Show" brings window to front
22. Tray → clicking "Quit" closes the app
23. Graceful shutdown → close app, other users see you go offline within 30s
24. Escape key → closes any open modal/panel
25. Production build → `pnpm tauri build` succeeds, installer produced
26. Binary size → under 20MB
27. Memory usage → under 100MB idle
28. Install and run → fresh install works, full flow from identity creation to chatting

---

### WHAT YOU'VE BUILT — PHASE 1 COMPLETE

When Milestone 1.8 is verified, you have:

✅ **Self-sovereign identity** — cryptographic keypairs, local encrypted keystore, backup/restore
✅ **Peer-to-peer messaging** — real-time via GunJS, no central server
✅ **Community Nodes** — create, join via invite, channels, member lists
✅ **Text channels** — real-time chat with grouping, timestamps, history, typing indicators
✅ **E2E encrypted DMs** — ECDH key exchange, friend-gated, zero-knowledge
✅ **Friend system** — request/accept flow, mutual relationships, block/unblock
✅ **Presence** — online/idle/DND/invisible, heartbeat, community + friend visibility
✅ **Profile system** — editable, per-field visibility, profile popups
✅ **Settings** — passphrase management, backup, privacy controls
✅ **Desktop app** — native Tauri binary, system tray, keyboard shortcuts

That's a functional, installable, decentralized communication platform.
No servers. No corporate middlemen. Just math.

---

### WHAT'S NEXT — PHASE 2

Phase 2 takes Nodes from "functional" to "competitive":

- **Milestone 2.1:** Voice channels (WebRTC mesh for small groups)
- **Milestone 2.2:** LiveKit integration (SFU for larger voice rooms)
- **Milestone 2.3:** Roles & Permissions (admin, moderator, custom roles)
- **Milestone 2.4:** File sharing via IPFS (images, documents, client-side encrypted)
- **Milestone 2.5:** Moderation tools (kick, ban, message deletion, audit log)
- **Milestone 2.6:** Message enhancements (reactions, replies, threads, embeds, markdown)
- **Milestone 2.7:** Search (full-text message search within Nodes and DMs)

Phase 2 is where you start talking about Nodes publicly.
