# UI/UX POLISH — DESIGN SYSTEM & MOTION
## Nodes: Decentralized Communication Platform

---

### ⚠️ READ THIS FIRST
### This is a visual/UX overhaul. NO new features, NO new functionality. Every component already works. This pass makes it FEEL premium. The goal: someone opens Nodes and thinks "this is better than Discord" before they send a single message.

---

### DESIGN DIRECTION

**Inspiration:** leveq.dev — deep space dark theme, subtle ambient glows, glass-like surfaces with depth, smooth transitions, refined typography. Not flat, not skeuomorphic — somewhere in between. Layered, atmospheric, alive.

**Tone:** Cyberpunk minimalism. Dark and deep but not oppressive. Subtle light sources that make surfaces feel like they exist in physical space. Every interaction has weight and response.

**Differentiator:** Discord feels like a flat web app. Nodes should feel like a native interface that breathes — depth through layered surfaces, glow through accent colors, life through motion.

---

### 1. COLOR SYSTEM OVERHAUL

Replace the current flat color tokens with a layered depth system. The key insight: backgrounds should have MULTIPLE depth levels, not just one "bg" and one "surface."

**apps/desktop/src/styles/globals.css — update CSS variables:**

```css
:root {
  /* ── Background Depth Layers ── */
  /* Each layer is slightly lighter, creating visual hierarchy */
  --color-bg-base: #0a0a14;          /* Deepest — app background, behind everything */
  --color-bg-primary: #0f0f1e;       /* Node sidebar, status bar */
  --color-bg-secondary: #141425;     /* Channel sidebar, member sidebar */
  --color-bg-tertiary: #1a1a30;      /* Main content area */
  --color-bg-elevated: #1e1e38;      /* Cards, message input, modals */
  --color-bg-float: #242445;         /* Dropdowns, popups, tooltips */

  /* ── Surface Effects ── */
  --color-surface-glass: rgba(255, 255, 255, 0.03);   /* Glassmorphism overlay */
  --color-surface-hover: rgba(255, 255, 255, 0.05);   /* Hover state */
  --color-surface-active: rgba(255, 255, 255, 0.08);  /* Active/selected state */
  --color-surface-border: rgba(255, 255, 255, 0.06);  /* Subtle borders */

  /* ── Accent Colors (from leveq.dev purple/blue palette) ── */
  --color-accent-primary: #7c5bf0;     /* Primary purple — buttons, links, active states */
  --color-accent-primary-glow: rgba(124, 91, 240, 0.15);  /* Glow behind accent elements */
  --color-accent-primary-dim: rgba(124, 91, 240, 0.4);    /* Muted accent for secondary use */
  --color-accent-secondary: #5b8cf0;   /* Blue — secondary actions, info */
  --color-accent-gradient: linear-gradient(135deg, #7c5bf0, #5b8cf0);  /* Accent gradient */

  /* ── Text Hierarchy ── */
  --color-text-primary: #e8e6f0;      /* Primary text — high contrast but not pure white */
  --color-text-secondary: #9896a8;    /* Secondary — labels, timestamps */
  --color-text-muted: #5c5a6e;        /* Muted — placeholders, disabled */
  --color-text-accent: #a78bfa;        /* Accent text — links, highlights */

  /* ── Semantic Colors ── */
  --color-success: #4ade80;
  --color-success-glow: rgba(74, 222, 128, 0.15);
  --color-warning: #fbbf24;
  --color-warning-glow: rgba(251, 191, 36, 0.15);
  --color-danger: #f87171;
  --color-danger-glow: rgba(248, 113, 113, 0.15);

  /* ── Presence Dots ── */
  --color-online: #4ade80;
  --color-idle: #fbbf24;
  --color-dnd: #f87171;
  --color-offline: #5c5a6e;

  /* ── Shadows & Depth ── */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 32px rgba(0, 0, 0, 0.5);
  --shadow-glow-accent: 0 0 20px rgba(124, 91, 240, 0.2);
  --shadow-glow-success: 0 0 12px rgba(74, 222, 128, 0.2);

  /* ── Border Radius ── */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;
  --radius-xl: 20px;
  --radius-full: 9999px;

  /* ── Transitions ── */
  --transition-fast: 120ms ease;
  --transition-normal: 200ms ease;
  --transition-smooth: 300ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-spring: 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
  --transition-slow: 500ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

---

### 2. TYPOGRAPHY

Install a distinctive font pairing. Avoid Inter/Roboto/Arial.

```bash
# Option A: Use Google Fonts via CDN in index.html
# Heading: "Outfit" — geometric, clean, modern
# Body: "IBM Plex Sans" — technical feel, excellent readability at small sizes
```

**In apps/desktop/index.html, add:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=IBM+Plex+Sans:wght@300;400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**Font usage:**
```css
body {
  font-family: 'IBM Plex Sans', sans-serif;
  font-weight: 400;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

h1, h2, h3 {
  font-family: 'Outfit', sans-serif;
}

code, .font-mono, .public-key {
  font-family: 'IBM Plex Mono', monospace;
}
```

**IMPORTANT NOTE:** Since Nodes is a Tauri desktop app, Google Fonts loaded via CDN will only work when online. For true offline support, download the font files and bundle them locally:

```
apps/desktop/src/assets/fonts/
├── Outfit-Regular.woff2
├── Outfit-Medium.woff2
├── Outfit-SemiBold.woff2
├── Outfit-Bold.woff2
├── IBMPlexSans-Light.woff2
├── IBMPlexSans-Regular.woff2
├── IBMPlexSans-Medium.woff2
├── IBMPlexSans-SemiBold.woff2
├── IBMPlexMono-Regular.woff2
└── IBMPlexMono-Medium.woff2
```

Load via @font-face in globals.css instead of Google Fonts CDN. This guarantees fonts work offline and improves load time.

---

### 3. DEPTH & GLASSMORPHISM

Every panel and sidebar should feel like it exists on a different layer. Use these techniques:

**Sidebar depth:**
```css
.sidebar-node {
  background: var(--color-bg-primary);
  border-right: 1px solid var(--color-surface-border);
}

.sidebar-channel {
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-surface-border);
}

.main-content {
  background: var(--color-bg-tertiary);
}

.sidebar-member {
  background: var(--color-bg-secondary);
  border-left: 1px solid var(--color-surface-border);
}
```

**Glass effect for modals and popups:**
```css
.glass-panel {
  background: rgba(20, 20, 40, 0.85);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border: 1px solid rgba(255, 255, 255, 0.06);
  box-shadow: var(--shadow-lg), inset 0 1px 0 rgba(255, 255, 255, 0.04);
}
```

**Elevated cards (profile popup, settings panels):**
```css
.card-elevated {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-surface-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-md);
}
```

**Ambient glow behind primary accent elements:**
```css
.glow-accent {
  position: relative;
}

.glow-accent::before {
  content: '';
  position: absolute;
  inset: -4px;
  background: var(--color-accent-gradient);
  border-radius: inherit;
  opacity: 0.15;
  filter: blur(12px);
  z-index: -1;
  transition: opacity var(--transition-smooth);
}

.glow-accent:hover::before {
  opacity: 0.25;
}
```

---

### 4. ANIMATION SYSTEM

Create a centralized animation utility. Define all animations in CSS and trigger them via class names or Tailwind utilities.

**apps/desktop/src/styles/animations.css:**
```css
/* ── Entrance Animations ── */

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeInDown {
  from { opacity: 0; transform: translateY(-12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes fadeInScale {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes slideInRight {
  from { opacity: 0; transform: translateX(20px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-20px); }
  to { opacity: 1; transform: translateX(0); }
}

/* ── Exit Animations ── */

@keyframes fadeOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

@keyframes fadeOutDown {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(12px); }
}

@keyframes fadeOutScale {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(0.95); }
}

/* ── Modal / Overlay ── */

@keyframes modalIn {
  from {
    opacity: 0;
    transform: scale(0.92) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes modalOut {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.92) translateY(10px);
  }
}

@keyframes overlayIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes overlayOut {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* ── Skeleton Loading ── */

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* ── Presence Pulse ── */

@keyframes presencePulse {
  0%, 100% { box-shadow: 0 0 0 0 currentColor; }
  50% { box-shadow: 0 0 0 4px transparent; }
}

/* ── Typing Dots ── */

@keyframes typingBounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
}

/* ── Toast Slide In ── */

@keyframes toastIn {
  from {
    opacity: 0;
    transform: translateX(100%) scale(0.95);
  }
  to {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
}

@keyframes toastOut {
  from {
    opacity: 1;
    transform: translateX(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateX(100%) scale(0.95);
  }
}

/* ── Utility Classes ── */

.animate-fadeIn { animation: fadeIn var(--transition-smooth) both; }
.animate-fadeInUp { animation: fadeInUp var(--transition-smooth) both; }
.animate-fadeInDown { animation: fadeInDown var(--transition-smooth) both; }
.animate-fadeInScale { animation: fadeInScale var(--transition-spring) both; }
.animate-slideInRight { animation: slideInRight var(--transition-smooth) both; }
.animate-slideInLeft { animation: slideInLeft var(--transition-smooth) both; }
.animate-fadeOut { animation: fadeOut var(--transition-fast) both; }
.animate-modalIn { animation: modalIn 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.animate-overlayIn { animation: overlayIn var(--transition-smooth) both; }
.animate-toastIn { animation: toastIn 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
.animate-toastOut { animation: toastOut 200ms ease both; }

/* ── Staggered Children ── */
/* Apply to parent, children get sequential delays */

.stagger-children > * {
  animation: fadeInUp var(--transition-smooth) both;
}
.stagger-children > *:nth-child(1) { animation-delay: 0ms; }
.stagger-children > *:nth-child(2) { animation-delay: 50ms; }
.stagger-children > *:nth-child(3) { animation-delay: 100ms; }
.stagger-children > *:nth-child(4) { animation-delay: 150ms; }
.stagger-children > *:nth-child(5) { animation-delay: 200ms; }
.stagger-children > *:nth-child(6) { animation-delay: 250ms; }
.stagger-children > *:nth-child(7) { animation-delay: 300ms; }
.stagger-children > *:nth-child(8) { animation-delay: 350ms; }
```

Import in globals.css:
```css
@import './animations.css';
```

---

### 5. SKELETON LOADERS

Create a reusable skeleton component system for loading states.

**apps/desktop/src/components/ui/Skeleton.tsx:**

```
A skeleton component that mimics the shape of content while loading.

Props:
  - variant: "text" | "circular" | "rectangular" | "rounded"
  - width: string (e.g., "100%", "200px")
  - height: string
  - lines: number (for text variant — renders multiple lines with varying widths)

Styling:
  background: linear-gradient(
    90deg,
    var(--color-bg-elevated) 25%,
    rgba(255, 255, 255, 0.05) 50%,
    var(--color-bg-elevated) 75%
  );
  background-size: 400% 100%;
  animation: shimmer 1.8s ease-in-out infinite;
  border-radius: based on variant (full for circular, --radius-sm for text, etc.)
```

**Skeleton compositions for specific areas:**

**apps/desktop/src/components/skeletons/MessageSkeleton.tsx:**
```
Mimics a message group while loading history:

┌──────────────────────────────────────────────────┐
│  [●●]  ████████████          ████████            │  ← circle + name + timestamp
│        █████████████████████████████████          │  ← message line 1
│        ████████████████████                       │  ← message line 2 (shorter)
└──────────────────────────────────────────────────┘

Render 4-6 of these, with staggered animation delays.
The line widths should vary randomly (60-100%) for a natural look.
```

**apps/desktop/src/components/skeletons/MemberSkeleton.tsx:**
```
Mimics a member list item:

┌──────────────────────┐
│  [●●]  ████████████  │  ← circle + name
└──────────────────────┘

Render 5-8 of these.
```

**apps/desktop/src/components/skeletons/ChannelSkeleton.tsx:**
```
Mimics channel list items:

┌──────────────────────┐
│  # ██████████████    │
│  # █████████         │
│  # ████████████      │
└──────────────────────┘
```

**apps/desktop/src/components/skeletons/ConversationSkeleton.tsx:**
```
Mimics DM conversation list item:

┌──────────────────────────────┐
│  [●●]  ████████████  ██████ │  ← avatar + name + time
│        ██████████████████    │  ← message preview
└──────────────────────────────┘
```

**Where to show skeletons:**
- Message list: when switching channels and history is loading
- Member list: when loading members for a new Node
- Channel list: when loading channels for a new Node
- DM conversation list: when loading conversations
- Profile popup: when resolving a user's profile
- Friend list: when loading friends

---

### 6. MODAL & PANEL ANIMATION SYSTEM

Create a wrapper component for all modals and panels.

**apps/desktop/src/components/ui/Modal.tsx:**

```
A modal wrapper that handles:
- Overlay fade in (animate-overlayIn)
- Content scale + slide in (animate-modalIn)
- Escape key to close
- Click outside to close
- Exit animation before unmount (requires state management)

Structure:
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    {/* Overlay */}
    <div
      className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-overlayIn"
      onClick={onClose}
    />
    {/* Content */}
    <div className="relative glass-panel rounded-xl animate-modalIn max-w-lg w-full mx-4">
      {children}
    </div>
  </div>

For exit animation:
- Use a state variable `isClosing`
- When close is triggered, set isClosing=true, apply exit animation classes
- After animation duration (200ms), call the actual onClose callback
- This gives the modal time to animate out before being unmounted
```

**apps/desktop/src/components/ui/SlidePanel.tsx:**

```
A side panel that slides in from the right (for Settings, Profile Edit, etc.)

Structure:
  <div className="fixed inset-0 z-50 flex">
    {/* Overlay */}
    <div
      className="flex-1 bg-black/40 animate-overlayIn"
      onClick={onClose}
    />
    {/* Panel */}
    <div className="w-[480px] bg-bg-secondary border-l border-surface-border
                    animate-slideInRight shadow-lg h-full overflow-y-auto">
      {children}
    </div>
  </div>

Exit: reverse the slide animation before unmount.
```

**Apply these wrappers to ALL existing modals:**
- CreateNodeModal
- JoinNodeModal
- CreateChannelModal
- NewDMModal
- ProfilePanel (use SlidePanel)
- SettingsPage (use SlidePanel or full overlay)
- ProfilePopup (use custom positioning, not modal — but add fadeInScale animation)

---

### 7. COMPONENT-LEVEL POLISH

**Node Sidebar Icons:**
```css
/* Active Node indicator — glowing left pill */
.node-icon-active {
  position: relative;
}
.node-icon-active::before {
  content: '';
  position: absolute;
  left: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 32px;
  background: var(--color-accent-primary);
  border-radius: 0 4px 4px 0;
  box-shadow: var(--shadow-glow-accent);
  transition: height var(--transition-spring);
}

/* Hover: icon becomes rounded-xl from rounded-full (Discord-style morph) */
.node-icon {
  transition: border-radius var(--transition-smooth), background var(--transition-fast);
  border-radius: var(--radius-full);
}
.node-icon:hover {
  border-radius: var(--radius-lg);
}
.node-icon-active {
  border-radius: var(--radius-lg);
}
```

**Channel list items:**
```css
.channel-item {
  transition: background var(--transition-fast), color var(--transition-fast);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
}
.channel-item:hover {
  background: var(--color-surface-hover);
  color: var(--color-text-primary);
}
.channel-item-active {
  background: var(--color-surface-active);
  color: var(--color-text-primary);
}
```

**Message hover state:**
```css
/* Subtle background highlight on message hover */
.message-group:hover {
  background: var(--color-surface-glass);
}

/* Show timestamp on compact messages only on hover */
.message-compact .timestamp {
  opacity: 0;
  transition: opacity var(--transition-fast);
}
.message-compact:hover .timestamp {
  opacity: 1;
}
```

**Member list items:**
```css
.member-item {
  transition: background var(--transition-fast);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
  cursor: pointer;
}
.member-item:hover {
  background: var(--color-surface-hover);
}
```

**Presence dots — add subtle glow to online status:**
```css
.presence-dot-online {
  background: var(--color-online);
  box-shadow: 0 0 6px var(--color-online);
}
```

**Message input:**
```css
.message-input-container {
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-surface-border);
  border-radius: var(--radius-md);
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  margin: 0 16px 16px 16px;
}

.message-input-container:focus-within {
  border-color: var(--color-accent-primary-dim);
  box-shadow: 0 0 0 2px var(--color-accent-primary-glow);
}
```

**Buttons — refine with depth:**
```css
.btn-primary {
  background: var(--color-accent-gradient);
  color: white;
  border: none;
  border-radius: var(--radius-md);
  padding: 10px 20px;
  font-weight: 500;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast), opacity var(--transition-fast);
  box-shadow: var(--shadow-sm), 0 0 12px var(--color-accent-primary-glow);
}

.btn-primary:hover {
  box-shadow: var(--shadow-md), 0 0 20px var(--color-accent-primary-glow);
  transform: translateY(-1px);
}

.btn-primary:active {
  transform: translateY(0) scale(0.98);
  box-shadow: var(--shadow-sm);
}
```

**Toasts — glass effect:**
```css
.toast {
  background: rgba(20, 20, 40, 0.9);
  backdrop-filter: blur(16px);
  border: 1px solid var(--color-surface-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  animation: toastIn 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

/* Left accent stripe by toast type */
.toast-success { border-left: 3px solid var(--color-success); }
.toast-error { border-left: 3px solid var(--color-danger); }
.toast-info { border-left: 3px solid var(--color-accent-primary); }
.toast-warning { border-left: 3px solid var(--color-warning); }
```

---

### 8. SCROLL BEHAVIOR

**Custom scrollbar styling:**
```css
/* Thin, subtle scrollbar that matches the theme */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Auto-hide scrollbar — only show on hover */
.scrollbar-auto {
  scrollbar-gutter: stable;
}
.scrollbar-auto::-webkit-scrollbar-thumb {
  background: transparent;
}
.scrollbar-auto:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
}
```

---

### 9. LOADING STATES

**Full app loading (initial boot):**

When the app first opens, before auth check completes, show a splash screen:

```
┌──────────────────────────────────────────────┐
│                                              │
│                                              │
│               ◆ (Nodes icon)                 │
│                                              │
│               N O D E S                      │
│                                              │
│            ·  ·  ·  (loading dots)           │
│                                              │
│                                              │
└──────────────────────────────────────────────┘
```

- Background: var(--color-bg-base) with a subtle radial gradient glow in the center (accent color, very dim)
- Logo fades in (animate-fadeInScale)
- Text fades in with delay (animate-fadeIn, delay 200ms)
- Loading dots pulse sequentially
- Transitions to auth screen or app shell with a smooth crossfade

**Channel loading:**
- When switching channels, show MessageSkeleton in the content area
- Skeleton fades out, real messages fade in (crossfade using opacity transition)
- Duration: max 500ms for skeleton, then force-show whatever we have

**Node switching:**
- When switching Nodes, channel sidebar shows ChannelSkeleton
- Member sidebar shows MemberSkeleton
- Both fade in staggered, then swap with real content

---

### 10. MICRO-INTERACTIONS

Small details that make the app feel alive:

**Unread badge bounce:**
```css
@keyframes badgePop {
  0% { transform: scale(0); }
  60% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.unread-badge-new {
  animation: badgePop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
```

**Send button pulse when content exists:**
```css
.send-btn-active {
  color: var(--color-accent-primary);
  transition: color var(--transition-fast), transform var(--transition-fast);
}
.send-btn-active:hover {
  transform: scale(1.1);
}
```

**Node icon tooltip:**
- On hover, show Node name in a small tooltip to the right of the icon
- Tooltip uses glass-panel styling
- Fades in with animate-fadeIn (short duration: 150ms)
- Has a small arrow/triangle pointing left toward the icon

**"New messages" banner:**
```css
.new-messages-banner {
  background: var(--color-accent-gradient);
  color: white;
  border-radius: var(--radius-full);
  padding: 6px 16px;
  font-size: 13px;
  font-weight: 500;
  box-shadow: var(--shadow-md), var(--shadow-glow-accent);
  animation: fadeInUp 300ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  cursor: pointer;
  transition: transform var(--transition-fast);
}
.new-messages-banner:hover {
  transform: translateY(-2px);
}
```

**Context menu animation:**
```css
.context-menu {
  animation: fadeInScale 150ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
  transform-origin: top right; /* or compute based on position */
}
```

---

### 11. AUTH SCREEN OVERHAUL

The auth screens (Create Identity, Login) are the first thing a user sees. They need to feel premium.

**Background:**
- var(--color-bg-base) with a subtle animated gradient mesh or very dim radial gradients
- Two or three blurred circles of accent color positioned off-center (like ambient light sources)
- These can be static divs with large border-radius, huge blur, and low opacity

```css
.auth-bg {
  position: relative;
  overflow: hidden;
}

.auth-bg::before {
  content: '';
  position: absolute;
  top: -20%;
  left: -10%;
  width: 500px;
  height: 500px;
  background: radial-gradient(circle, var(--color-accent-primary-glow) 0%, transparent 70%);
  filter: blur(80px);
  opacity: 0.4;
}

.auth-bg::after {
  content: '';
  position: absolute;
  bottom: -20%;
  right: -10%;
  width: 400px;
  height: 400px;
  background: radial-gradient(circle, rgba(91, 140, 240, 0.1) 0%, transparent 70%);
  filter: blur(80px);
  opacity: 0.3;
}
```

**Auth card:**
- Glass panel effect (backdrop-blur)
- Subtle border glow
- Content fades in with staggered children animation
- Logo at top with gentle glow

**Passphrase strength indicator overhaul:**
- Replace the simple bar with a segmented indicator
- Use accent gradient for the fill
- Smooth width transition on change

---

### 12. AMBIENT BACKGROUND EFFECT (OPTIONAL STRETCH)

For the main app (not just auth), add a very subtle ambient glow effect in the main content area:

```css
.main-content {
  position: relative;
}

.main-content::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 200px;
  background: radial-gradient(
    ellipse 60% 100% at 50% -20%,
    var(--color-accent-primary-glow) 0%,
    transparent 100%
  );
  pointer-events: none;
  opacity: 0.3;
}
```

This creates a very subtle purple glow at the top of the content area, like ambient lighting from above. It's barely noticeable but adds atmospheric depth. Adjust opacity to taste — it should be felt, not seen.

---

### VERIFICATION CHECKLIST

1. **Color depth** — Can you visually distinguish at least 4 background depth levels?
2. **Typography** — Headings use Outfit, body uses IBM Plex Sans, code uses IBM Plex Mono
3. **Modals** — All modals animate in (scale+fade) and out (reverse)
4. **Panels** — Settings/Profile slide in from right with overlay
5. **Skeletons** — Channel switch shows message skeletons → crossfade to real content
6. **Skeletons** — Node switch shows channel + member skeletons
7. **Toasts** — Slide in from right with glass effect and colored left accent stripe
8. **Scrollbars** — Thin, subtle, auto-hide on non-hover
9. **Message hover** — Subtle background highlight, timestamps appear on compact messages
10. **Node icons** — Active indicator pill with glow, hover morphs rounded-full → rounded-xl
11. **Buttons** — Primary buttons have gradient + glow, lift on hover, compress on click
12. **Presence dots** — Online dots have subtle glow
13. **Auth screens** — Ambient background glows, glass card, staggered content entrance
14. **Splash screen** — Loads with logo fade-in and loading dots before auth check
15. **Context menus** — Scale+fade entrance animation
16. **Profile popup** — Scale+fade entrance, glass effect
17. **Message input** — Glow border on focus
18. **Overall feel** — Does it feel like a premium native app, not a web page?

---

### PERFORMANCE NOTES

- `backdrop-filter: blur()` can be expensive. Use sparingly — only on modals, popups, and toasts that are temporary overlays. Don't use on permanent panels.
- All animations use CSS (no JS animation libraries). CSS animations are GPU-accelerated.
- Use `will-change: transform, opacity` on elements that animate frequently (but remove when not animating).
- Skeleton loaders should be lightweight — they're just divs with a gradient background animation.
- Keep stagger delays under 400ms total — beyond that it feels slow, not elegant.
- Test with reduced motion preference: `@media (prefers-reduced-motion: reduce)` should disable most animations.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```
