# POLISH PASS — Milestones 1.1–1.3
## Nodes: UI Feedback, Error Handling & Quality-of-Life

---

### OBJECTIVE
Add essential UI polish to the existing Identity System and Transport Layer. This is NOT a feature milestone — no new functionality. This is about making what exists feel like real software: responsive feedback, graceful errors, smooth transitions, and visual consistency.

---

### 1. TOAST NOTIFICATION SYSTEM

Create a lightweight, reusable toast system. No external dependencies — build it with Zustand + Tailwind.

**apps/desktop/src/stores/toast-store.ts:**
```typescript
import { create } from "zustand";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  duration?: number; // ms, default 4000
}

interface ToastState {
  toasts: Toast[];
  addToast: (type: ToastType, message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  addToast: (type, message, duration = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    set((state) => ({
      toasts: [...state.toasts, { id, type, message, duration }],
    }));

    // Auto-remove
    if (duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }));
      }, duration);
    }
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }));
  },
}));
```

**apps/desktop/src/components/ToastContainer.tsx:**

Create a fixed-position container (bottom-right) that renders active toasts. Each toast should:
- Slide in from the right with a CSS transition
- Show an icon based on type (checkmark for success, X for error, info circle, warning triangle — use simple SVG or unicode)
- Have a subtle progress bar at the bottom showing time remaining
- Be dismissible by clicking
- Stack vertically with newest on top
- Use these colors:
  - Success: `bg-nodes-accent/10 border-nodes-accent text-nodes-accent`
  - Error: `bg-nodes-danger/10 border-nodes-danger text-nodes-danger`
  - Info: `bg-nodes-primary/10 border-nodes-primary text-nodes-primary`
  - Warning: `bg-yellow-500/10 border-yellow-500 text-yellow-500`

Render `<ToastContainer />` at the root of App.tsx, outside of AuthGate so toasts work on auth screens too.

---

### 2. ADD TOASTS TO EXISTING FLOWS

Wire up toast notifications to every user-facing action:

**Identity Creation (CreateIdentity.tsx):**
- On success: `addToast("success", "Identity created. Welcome to Nodes.")`
- On error: `addToast("error", "Failed to create identity: {error.message}")`

**Login (Login.tsx):**
- On success: `addToast("success", "Welcome back, {displayName}.")`
- On wrong passphrase: `addToast("error", "Wrong passphrase. Try again.")`
- On no identity found: `addToast("error", "No identity found on this device.")`

**Logout:**
- On logout: `addToast("info", "Session locked.")`

**Connection state changes (wire into TransportProvider or ConnectionStatus):**
- Connected: `addToast("success", "Connected to network.")` — only show on reconnection, not initial load
- Disconnected: `addToast("warning", "Disconnected from network. Messages will sync when reconnected.")`
- Reconnecting: `addToast("info", "Reconnecting...")` — use duration 0 (persistent until state changes), then remove when connected

---

### 3. BUTTON LOADING & DISABLED STATES

Create a reusable Button component that handles loading state consistently.

**apps/desktop/src/components/ui/Button.tsx:**

Props: `children, onClick, loading, disabled, variant ("primary" | "secondary" | "danger" | "ghost"), fullWidth, size ("sm" | "md" | "lg")`

Behavior:
- When `loading=true`: show a small spinner (CSS animation, not a library), disable clicks, reduce opacity slightly
- When `disabled=true`: reduce opacity to 50%, cursor-not-allowed
- On click: briefly scale down (active:scale-95) for tactile feedback
- Variants:
  - Primary: `bg-nodes-primary hover:bg-nodes-primary-light text-white`
  - Secondary: `bg-nodes-surface border border-nodes-border text-nodes-text hover:border-nodes-primary`
  - Danger: `bg-transparent hover:bg-nodes-danger text-nodes-text-muted hover:text-white`
  - Ghost: `bg-transparent text-nodes-text-muted hover:text-nodes-text`

Replace all existing `<button>` elements in CreateIdentity, Login, and Dashboard with this component.

---

### 4. INPUT COMPONENT

Create a reusable Input component for consistent styling.

**apps/desktop/src/components/ui/Input.tsx:**

Props: `label, type, value, onChange, placeholder, error, maxLength, autoFocus, onKeyDown, hint`

Behavior:
- Consistent dark theme styling matching existing inputs
- When `error` is provided: red border (`border-nodes-danger`), error text below input in red
- When focused: `border-nodes-primary` with subtle ring (`ring-1 ring-nodes-primary/30`)
- Optional `hint` text below input in muted color (for things like "Encrypts your keypair locally")
- Optional character counter when `maxLength` is set (e.g., "12/32" in muted text aligned right)

Replace all existing `<input>` elements in CreateIdentity and Login with this component.

---

### 5. AUTH SCREEN TRANSITIONS

Add smooth transitions between Create Identity ↔ Login ↔ Import Backup screens.

In AuthGate.tsx:
- Wrap the active screen in a container with a fade+slide transition
- When switching modes, the outgoing screen fades out (opacity 1→0, translateY 0→-8px, 150ms)
- The incoming screen fades in (opacity 0→1, translateY 8px→0, 150ms)
- Use CSS transitions or a simple useState-based approach — no animation library needed

---

### 6. PASSPHRASE STRENGTH INDICATOR

In CreateIdentity.tsx, add a visual passphrase strength indicator below the passphrase input:

- < 8 chars: red bar (20% width), label "Too short"
- 8-11 chars: orange bar (40% width), label "Weak"
- 12-15 chars: yellow bar (60% width), label "Fair"
- 16-23 chars: green bar (80% width), label "Strong"
- 24+ chars: bright green bar (100% width), label "Excellent"

This is a simple length-based heuristic — no need for entropy calculation. It's a visual nudge, not a security gate.

---

### 7. PUBLIC KEY DISPLAY IMPROVEMENTS

In the Dashboard, the public key is currently a long ugly string. Improve it:

- Truncate to first 8 and last 8 characters with "..." in the middle: `qt1BMyFL...joh0Mh8`
- Add a "Copy" button (small, ghost style) next to it
- On copy: briefly change button text to "Copied!" with a checkmark, then revert after 2 seconds
- Add a toast: `addToast("info", "Public key copied to clipboard.")`
- Use `navigator.clipboard.writeText()` for the copy action

---

### 8. APP SHELL STRUCTURE

Refine the overall app layout to prepare for future milestones. Even though we only have a dashboard right now, set up the shell:

```
┌──────────────────────────────────────────┐
│  Title Bar (Nodes logo + window controls) │  ← Optional, Tauri handles this
├──────────────────────────────────────────┤
│                                          │
│              Main Content                │
│          (Dashboard for now)             │
│                                          │
│                                          │
├──────────────────────────────────────────┤
│  Status Bar: Connection + User Info      │
└──────────────────────────────────────────┘
```

**Status bar (bottom) should show:**
- Left: Connection status (existing ConnectionStatus component)
- Right: Current user display name + truncated public key + account type badge

The status bar gives persistent context no matter what screen the user is on.

---

### 9. ACCOUNT TYPE BADGE

Create a small badge component used across the app:

**apps/desktop/src/components/ui/Badge.tsx:**

- Public account: Subtle green badge with "Public" text
- Private account: Subtle purple badge with lock icon + "Private" text
- Use in: Dashboard profile card, status bar, future member lists

---

### 10. ERROR BOUNDARY

**apps/desktop/src/components/ErrorBoundary.tsx:**

Create a React error boundary that catches render errors and shows a recovery UI instead of a white screen:

- Display: "Something went wrong" with the error message in a collapsible details section
- Show a "Reload" button that calls `window.location.reload()`
- Show a "Clear Data & Restart" button that clears localStorage and reloads (nuclear option)
- Style it consistently with the dark theme
- Wrap the entire app in this boundary in App.tsx

---

### 11. VISUAL CONSISTENCY PASS

Do a sweep of all existing components and ensure:

- All text uses the `text-nodes-*` color tokens — no hardcoded colors
- All backgrounds use `bg-nodes-*` tokens
- All borders use `border-nodes-border`
- Consistent border-radius: `rounded-lg` for cards/inputs, `rounded-xl` for large containers
- Consistent spacing: `gap-4` or `space-y-4` between form elements
- Consistent padding: `p-6` for cards, `px-4 py-3` for inputs, `py-2 px-4` for buttons
- Font sizes: headings use `text-3xl font-bold`, subheadings `text-xl font-semibold`, body `text-sm`, captions `text-xs`
- All interactive elements have `transition-colors` for smooth hover states
- Focus states on all inputs and buttons (visible focus ring for keyboard navigation)

---

### VERIFICATION

When done, the app should:
1. Show a toast when identity is created
2. Show a toast on login success/failure  
3. Show a toast when connection state changes
4. All buttons show loading spinners during async operations
5. Inputs show validation errors inline
6. Auth screens transition smoothly
7. Public key is truncated with a working copy button
8. Error boundary catches crashes gracefully
9. The app feels cohesive — every screen looks like it belongs to the same product
10. No visual jank, no unstyled flashes, no layout shifts
