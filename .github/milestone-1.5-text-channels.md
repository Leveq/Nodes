# MILESTONE 1.5 — TEXT CHANNELS
## Nodes: Decentralized Communication Platform

---

### OBJECTIVE
Wire up real-time messaging in text channels using the MessageTransport built in Milestone 1.3. Users can send and receive messages in real-time, see message history when switching channels, and see typing indicators. This is the core interaction of the app — when this milestone is done, two users can have a live conversation through a decentralized P2P network with no central server.

---

### DEFINITION OF DONE
- [ ] User can type a message and send it with Enter key or Send button
- [ ] Messages appear in real-time for all members in the channel (P2P via Gun)
- [ ] Messages display: author name, avatar placeholder, timestamp, and content
- [ ] Consecutive messages from the same author are grouped (compact mode, no repeated header)
- [ ] Message history loads when switching channels (most recent messages first)
- [ ] Auto-scroll to bottom on new messages (unless user has scrolled up to read history)
- [ ] "New messages" indicator appears when scrolled up and new messages arrive
- [ ] Typing indicator shows "kdogg is typing..." when another user is typing
- [ ] Typing indicator auto-clears after 3 seconds of inactivity
- [ ] Unread message badge/dot on channels in the sidebar
- [ ] Messages are signed by the author's keypair (authenticity)
- [ ] System messages for join/leave events ("kdogg joined the Node")
- [ ] Empty channel state: "Welcome to #channel-name" with topic
- [ ] Message input is disabled if no channel is selected
- [ ] Timestamps show relative time ("2m ago") with full date on hover
- [ ] Message input supports multi-line with Shift+Enter
- [ ] All operations go through MessageTransport and PresenceTransport (no direct Gun calls)
- [ ] Tests for message rendering, grouping logic, and timestamp formatting

---

### ARCHITECTURE CONTEXT

Messages flow through the Transport Abstraction Layer:

```
User types message
  → MessageInput component
    → useTransport().messages.send(channelId, message)
      → GunMessageTransport.send()
        → gun.get("channels").get(channelId).get("messages").get(id).put(...)
          → Gun syncs to all peers
            → GunMessageTransport subscription fires
              → MessageList component re-renders with new message
```

**Message graph path:**
```
gun.get("channels").get(channelId).get("messages").get(messageId) → {
  id, content, timestamp, authorKey, channelId, type, signature
}
```

**Typing indicator path:**
```
gun.get("typing").get(channelId).get(publicKey) → {
  isTyping: boolean, timestamp: number
}
```

---

### STEP-BY-STEP INSTRUCTIONS

#### 1. CREATE MESSAGE STORE (apps/desktop)

**apps/desktop/src/stores/message-store.ts:**
```typescript
import { create } from "zustand";
import type { TransportMessage, Unsubscribe } from "@nodes/transport";

interface MessageState {
  // Messages keyed by channelId
  messages: Record<string, TransportMessage[]>;

  // Typing indicators keyed by channelId → publicKey[]
  typingUsers: Record<string, string[]>;

  // Unread tracking: channelId → count
  unreadCounts: Record<string, number>;

  // Currently active subscription
  activeSubscription: Unsubscribe | null;
  activeTypingSub: Unsubscribe | null;

  // Actions
  setMessages: (channelId: string, messages: TransportMessage[]) => void;
  addMessage: (channelId: string, message: TransportMessage) => void;
  setSubscription: (unsub: Unsubscribe | null) => void;
  setTypingSubscription: (unsub: Unsubscribe | null) => void;
  setTypingUsers: (channelId: string, users: string[]) => void;
  addTypingUser: (channelId: string, publicKey: string) => void;
  removeTypingUser: (channelId: string, publicKey: string) => void;
  incrementUnread: (channelId: string) => void;
  clearUnread: (channelId: string) => void;
  clearChannel: (channelId: string) => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: {},
  typingUsers: {},
  unreadCounts: {},
  activeSubscription: null,
  activeTypingSub: null,

  setMessages: (channelId, messages) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [channelId]: deduplicateMessages(messages),
      },
    }));
  },

  addMessage: (channelId, message) => {
    set((state) => {
      const existing = state.messages[channelId] || [];

      // Avoid duplicates
      if (existing.some((m) => m.id === message.id)) {
        return state;
      }

      return {
        messages: {
          ...state.messages,
          [channelId]: [...existing, message].sort(
            (a, b) => a.timestamp - b.timestamp
          ),
        },
      };
    });
  },

  setSubscription: (unsub) => {
    // Clean up previous subscription
    const prev = get().activeSubscription;
    if (prev) prev();
    set({ activeSubscription: unsub });
  },

  setTypingSubscription: (unsub) => {
    const prev = get().activeTypingSub;
    if (prev) prev();
    set({ activeTypingSub: unsub });
  },

  setTypingUsers: (channelId, users) => {
    set((state) => ({
      typingUsers: { ...state.typingUsers, [channelId]: users },
    }));
  },

  addTypingUser: (channelId, publicKey) => {
    set((state) => {
      const current = state.typingUsers[channelId] || [];
      if (current.includes(publicKey)) return state;
      return {
        typingUsers: {
          ...state.typingUsers,
          [channelId]: [...current, publicKey],
        },
      };
    });
  },

  removeTypingUser: (channelId, publicKey) => {
    set((state) => {
      const current = state.typingUsers[channelId] || [];
      return {
        typingUsers: {
          ...state.typingUsers,
          [channelId]: current.filter((k) => k !== publicKey),
        },
      };
    });
  },

  incrementUnread: (channelId) => {
    set((state) => ({
      unreadCounts: {
        ...state.unreadCounts,
        [channelId]: (state.unreadCounts[channelId] || 0) + 1,
      },
    }));
  },

  clearUnread: (channelId) => {
    set((state) => ({
      unreadCounts: { ...state.unreadCounts, [channelId]: 0 },
    }));
  },

  clearChannel: (channelId) => {
    const { activeSubscription, activeTypingSub } = get();
    if (activeSubscription) activeSubscription();
    if (activeTypingSub) activeTypingSub();

    set({
      activeSubscription: null,
      activeTypingSub: null,
    });
  },
}));

function deduplicateMessages(messages: TransportMessage[]): TransportMessage[] {
  const seen = new Set<string>();
  return messages
    .filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}
```

#### 2. CREATE CHANNEL VIEW COMPONENT

This is the main content area that manages the message subscription lifecycle.

**apps/desktop/src/components/channel/ChannelView.tsx:**

```typescript
/**
 * ChannelView orchestrates the message experience for a channel:
 * 1. Subscribes to real-time messages when the channel becomes active
 * 2. Loads message history on mount
 * 3. Subscribes to typing indicators
 * 4. Cleans up subscriptions when switching channels
 * 5. Renders MessageList + MessageInput
 *
 * This component should:
 * - Accept channelId and channelName as props
 * - Use useTransport() to access messages and presence transports
 * - Use useMessageStore for message state
 * - Use useIdentityStore for the current user's publicKey
 *
 * On mount / channelId change:
 *   1. Clear previous subscriptions via messageStore.clearChannel()
 *   2. Load history: transport.messages.getHistory(channelId, { limit: 50 })
 *   3. Store in messageStore.setMessages(channelId, history)
 *   4. Subscribe to new messages: transport.messages.subscribe(channelId, handler)
 *      - handler calls messageStore.addMessage(channelId, message)
 *      - If the message is not from current user AND user is scrolled up,
 *        increment unread count
 *   5. Subscribe to typing: transport.presence.subscribeTyping(channelId, handler)
 *      - handler updates typingUsers in messageStore
 *   6. Clear unread for this channel: messageStore.clearUnread(channelId)
 *   7. Store subscription cleanup functions in messageStore
 *
 * On unmount:
 *   - Clean up all subscriptions
 *
 * Render:
 *   <div className="flex flex-col h-full">
 *     <MessageList />     ← flex-1, scrollable
 *     <TypingIndicator />
 *     <MessageInput />
 *   </div>
 */
```

#### 3. CREATE MESSAGE LIST COMPONENT

**apps/desktop/src/components/channel/MessageList.tsx:**

```typescript
/**
 * MessageList renders all messages for the active channel with proper
 * grouping, timestamps, and auto-scroll behavior.
 *
 * MESSAGE GROUPING RULES:
 * - Consecutive messages from the same author within 5 minutes are "grouped"
 * - Grouped messages show only content (no author header, no avatar)
 * - The first message in a group shows: avatar placeholder | author name | timestamp
 * - System messages (join/leave) are always standalone, centered, muted text
 *
 * AUTO-SCROLL BEHAVIOR:
 * - On new message: scroll to bottom IF already at bottom (within 100px)
 * - If user has scrolled up: do NOT auto-scroll, show "New messages ↓" button
 * - Clicking "New messages ↓" scrolls to bottom and dismisses the indicator
 * - On initial load: always scroll to bottom
 *
 * Implementation:
 * - Use a ref on the scroll container to track scroll position
 * - isAtBottom = scrollHeight - scrollTop - clientHeight < 100
 * - Use useEffect watching messages array to trigger scroll
 * - Use a "jump to bottom" floating button when not at bottom and new messages exist
 *
 * TIMESTAMP DISPLAY:
 * - Show relative time: "just now", "2m ago", "1h ago", "Yesterday at 3:45 PM"
 * - On hover, show full date/time in a tooltip: "February 11, 2026 at 3:45:23 PM"
 * - Date separators between messages on different days: "── Today ──", "── Yesterday ──", "── Feb 10, 2026 ──"
 *
 * EMPTY STATE:
 * - When no messages exist, show the channel welcome:
 *   Large # icon (like the current empty state)
 *   "Welcome to #channel-name"
 *   Channel topic in muted text
 *   "This is the beginning of the #channel-name channel."
 *
 * COMPONENT STRUCTURE:
 * - Outer: scrollable div with ref, flex-1, overflow-y-auto
 * - Map over grouped messages, render MessageGroup or SingleMessage
 * - "New messages" floating button (absolute positioned at bottom)
 *
 * MESSAGE ITEM RENDERING:
 *   Full message (first in group):
 *   ┌──────────────────────────────────────────┐
 *   │ [Avatar]  AuthorName        2:45 PM      │
 *   │           Message content here            │
 *   └──────────────────────────────────────────┘
 *
 *   Compact message (continuation):
 *   ┌──────────────────────────────────────────┐
 *   │           Another message from same user  │  ← timestamp on hover
 *   └──────────────────────────────────────────┘
 *
 *   System message:
 *   ┌──────────────────────────────────────────┐
 *   │      → kdogg joined the Node             │
 *   └──────────────────────────────────────────┘
 */
```

#### 4. CREATE MESSAGE INPUT COMPONENT

**apps/desktop/src/components/channel/MessageInput.tsx:**

```typescript
/**
 * MessageInput is the text input for sending messages.
 *
 * BEHAVIOR:
 * - Enter sends the message (if not empty after trimming)
 * - Shift+Enter inserts a newline (multi-line support)
 * - Input clears after successful send
 * - Input is disabled when no channel is selected
 * - Shows placeholder: "Message #channel-name"
 *
 * TYPING INDICATOR:
 * - On input change (debounced 500ms): call presence.setTyping(channelId, true)
 * - After 3 seconds of no input: call presence.setTyping(channelId, false)
 * - On send: immediately call presence.setTyping(channelId, false)
 * - Do NOT send typing events for empty input
 *
 * VISUAL:
 * - Styled container at the bottom of ChannelView
 * - Uses a <textarea> with auto-growing height (min 1 row, max 8 rows)
 * - Auto-grow: set height to "auto" then to scrollHeight on each input change
 * - Reset to single row after sending
 * - Optional: Send button on the right side (icon: arrow up in circle)
 *   - Button is muted when input is empty, accent color when content exists
 *
 * IMPLEMENTATION:
 * - Use useTransport() for messages.send() and presence.setTyping()
 * - Use useIdentityStore for current user's publicKey
 * - Use useNodeStore for active channelId
 * - useRef on textarea for auto-resize
 * - useRef for typing debounce timer
 *
 * SEND FLOW:
 *   1. Trim content, validate non-empty
 *   2. Call transport.messages.send(channelId, {
 *        content,
 *        authorKey: publicKey,
 *        type: "text"
 *      })
 *   3. Clear input, reset height
 *   4. Clear typing indicator
 *   5. Focus textarea
 *   6. On error: show toast, restore content to input
 */
```

#### 5. CREATE TYPING INDICATOR COMPONENT

**apps/desktop/src/components/channel/TypingIndicator.tsx:**

```typescript
/**
 * TypingIndicator displays who is currently typing in the channel.
 *
 * DISPLAY RULES:
 * - 0 users typing: render nothing (no space taken)
 * - 1 user: "kdogg is typing..."
 * - 2 users: "kdogg and user2 are typing..."
 * - 3+ users: "Several people are typing..."
 * - Never show the current user in the typing list
 *
 * VISUAL:
 * - Sits between MessageList and MessageInput
 * - Height: h-6 (fixed) when someone is typing, h-0 when not (smooth transition)
 * - Animated dots: three dots that pulse sequentially (CSS animation)
 * - Text is small and muted
 *
 * ANIMATED DOTS CSS:
 * Create a "bouncing dots" animation:
 *   .typing-dot { animation: bounce 1.4s infinite ease-in-out both; }
 *   .typing-dot:nth-child(1) { animation-delay: -0.32s; }
 *   .typing-dot:nth-child(2) { animation-delay: -0.16s; }
 *   @keyframes bounce {
 *     0%, 80%, 100% { transform: scale(0); }
 *     40% { transform: scale(1); }
 *   }
 *
 * IMPLEMENTATION:
 * - Read from useMessageStore typingUsers[channelId]
 * - Filter out current user's publicKey
 * - Resolve display names from profile data or member list
 *   (for now, use truncated public key if display name unavailable)
 */
```

#### 6. DISPLAY NAME RESOLUTION

Messages and typing indicators need display names, not raw public keys. Create a utility hook that resolves public keys to display names using the member list and profile resolution.

**apps/desktop/src/hooks/useDisplayName.ts:**
```typescript
/**
 * Hook to resolve a public key to a display name.
 *
 * Resolution order:
 * 1. Check current Node's member list (from nodeStore.members)
 *    - If member has a displayName, use it
 * 2. Check if it's the current user (from identityStore)
 * 3. Fall back to profile resolution via transport
 *    - Cache results to avoid repeated lookups
 * 4. Ultimate fallback: truncated public key ("qt1BM...h0Mh8")
 *
 * Returns: { displayName: string, isLoading: boolean }
 *
 * Consider a shared cache (Map<publicKey, displayName>) at the module level
 * to avoid re-fetching on every render. Invalidate on Node switch.
 */
```

**apps/desktop/src/hooks/useDisplayNames.ts:**
```typescript
/**
 * Batch version — resolves multiple public keys at once.
 * Useful for the member list and typing indicators.
 *
 * Returns: Record<string, string> mapping publicKey → displayName
 */
```

#### 7. UPDATE CHANNEL SIDEBAR WITH UNREAD BADGES

Update the channel list in **ChannelSidebar.tsx** to show unread indicators:

- Read `unreadCounts` from useMessageStore
- If unread count > 0 for a channel:
  - Bold the channel name (font-medium → font-bold)
  - Show a small badge with the count (if > 0, max display "99+")
  - Use `bg-nodes-primary text-white text-xs rounded-full min-w-[20px] h-5 px-1.5` for the badge
- When user clicks a channel (switches to it), clear unread: `messageStore.clearUnread(channelId)`

#### 8. HANDLE UNREAD COUNTING

In the ChannelView message subscription handler:

```typescript
// When a new message arrives via subscription:
const handleNewMessage = (message: TransportMessage) => {
  messageStore.addMessage(channelId, message);

  // If this message is NOT from the current user
  // AND this channel is NOT the active channel
  // → increment unread
  const activeChannelId = useNodeStore.getState().activeChannelId;
  const myKey = useIdentityStore.getState().publicKey;

  if (message.authorKey !== myKey && channelId !== activeChannelId) {
    messageStore.incrementUnread(channelId);
  }
};
```

**Important:** You need to subscribe to ALL channels in the active Node, not just the active one, so that unread counts update for background channels. Set up subscriptions for all channels when a Node becomes active, not just when a channel is selected.

#### 9. TIMESTAMP UTILITY

**apps/desktop/src/utils/time.ts:**
```typescript
/**
 * Format a timestamp for message display.
 *
 * Rules:
 * - Less than 1 minute: "just now"
 * - Less than 1 hour: "Xm ago"
 * - Less than 24 hours: "Xh ago"
 * - Same week: "Monday at 3:45 PM"
 * - Same year: "Feb 11 at 3:45 PM"
 * - Different year: "Feb 11, 2025 at 3:45 PM"
 *
 * For message headers (first in group):
 * - Today: "Today at 3:45 PM"
 * - Yesterday: "Yesterday at 3:45 PM"
 * - Otherwise: "Feb 11, 2026 at 3:45 PM"
 *
 * For compact messages (hover tooltip):
 * - Always full: "February 11, 2026 at 3:45:23 PM"
 *
 * For date separators:
 * - Today: "Today"
 * - Yesterday: "Yesterday"
 * - Otherwise: "February 11, 2026"
 */

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;

  return formatMessageTime(timestamp);
}

export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = isSameDay(date, now);
  const isYesterday = isSameDay(date, new Date(now.getTime() - 86400000));

  const time = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  if (isToday) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;

  const dateStr = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });

  return `${dateStr} at ${time}`;
}

export function formatFullTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatDateSeparator(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  if (isSameDay(date, now)) return "Today";
  if (isSameDay(date, new Date(now.getTime() - 86400000))) return "Yesterday";

  return date.toLocaleDateString([], {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function shouldShowDateSeparator(
  current: number,
  previous: number | null
): boolean {
  if (!previous) return true;
  return !isSameDay(new Date(current), new Date(previous));
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
```

#### 10. MESSAGE GROUPING UTILITY

**apps/desktop/src/utils/message-grouping.ts:**
```typescript
import type { TransportMessage } from "@nodes/transport";

export interface MessageGroup {
  authorKey: string;
  timestamp: number; // Timestamp of first message in group
  messages: TransportMessage[];
}

/**
 * Group consecutive messages from the same author within a time window.
 *
 * Rules:
 * - Same author AND within 5 minutes of previous message → group together
 * - System messages are never grouped
 * - Different author → new group
 * - Gap > 5 minutes even from same author → new group
 */
const GROUP_WINDOW = 5 * 60 * 1000; // 5 minutes

export function groupMessages(messages: TransportMessage[]): MessageGroup[] {
  const groups: MessageGroup[] = [];

  for (const message of messages) {
    const lastGroup = groups[groups.length - 1];

    const shouldGroup =
      lastGroup &&
      message.type !== "system" &&
      lastGroup.messages[0].type !== "system" &&
      message.authorKey === lastGroup.authorKey &&
      message.timestamp - lastGroup.messages[lastGroup.messages.length - 1].timestamp < GROUP_WINDOW;

    if (shouldGroup) {
      lastGroup.messages.push(message);
    } else {
      groups.push({
        authorKey: message.authorKey,
        timestamp: message.timestamp,
        messages: [message],
      });
    }
  }

  return groups;
}
```

#### 11. SUBSCRIBE TO ALL NODE CHANNELS FOR UNREAD

When a Node becomes active (in AppShell or a useEffect watching activeNodeId), set up message subscriptions for ALL channels in that Node — not just the viewed one. This way unread counts update in the background.

```typescript
/**
 * In AppShell or a dedicated hook like useNodeSubscriptions(nodeId):
 *
 * When activeNodeId changes:
 * 1. Clean up all previous channel subscriptions
 * 2. Get all channels for the new Node from nodeStore
 * 3. For each channel, subscribe to messages via transport
 * 4. In each subscription handler:
 *    - Add message to messageStore
 *    - If channel is NOT the active channel and author is NOT current user,
 *      increment unread count
 * 5. Store all unsubscribe functions for cleanup
 */
```

#### 12. SYSTEM MESSAGES

When a user joins a Node (in NodeManager.joinNode), also write a system message to the #general channel:

```typescript
// After successfully joining:
const generalChannel = channels.find(c => c.name === "general");
if (generalChannel) {
  await messageTransport.send(generalChannel.id, {
    content: `${displayName} joined the Node`,
    authorKey: "system",
    type: "system",
  });
}
```

Style system messages differently:
- Centered text, smaller font
- Muted color
- Arrow icon: "→ kdogg joined the Node"
- No avatar, no author header

---

### COMPONENT FILE STRUCTURE

```
apps/desktop/src/
├── components/
│   └── channel/
│       ├── ChannelView.tsx        # Orchestrator: subscriptions + layout
│       ├── MessageList.tsx        # Scrollable message list with grouping
│       ├── MessageGroup.tsx       # Renders a group of messages from one author
│       ├── MessageItem.tsx        # Single message (full or compact variant)
│       ├── SystemMessage.tsx      # System message (join/leave)
│       ├── MessageInput.tsx       # Text input with send + typing
│       ├── TypingIndicator.tsx    # "X is typing..." with animated dots
│       ├── DateSeparator.tsx      # "── Today ──" between date changes
│       └── NewMessagesBanner.tsx  # Floating "New messages ↓" button
├── hooks/
│   ├── useDisplayName.ts
│   ├── useDisplayNames.ts
│   └── useNodeSubscriptions.ts   # Subscribe to all channels in active Node
├── stores/
│   └── message-store.ts
└── utils/
    ├── time.ts
    └── message-grouping.ts
```

---

### VISUAL REFERENCE

```
┌────────────────────────────────────────────────────┐
│  #general  │  General discussion                   │
├────────────────────────────────────────────────────┤
│                                                    │
│               ── February 11, 2026 ──              │
│                                                    │
│  [K]  kdogg                    Today at 2:30 PM    │
│       Hey everyone, welcome to Nodes!              │
│       This is a decentralized chat.                │
│       Pretty cool right?                           │
│                                                    │
│  [T]  Testagain01              Today at 2:32 PM    │
│       Wow this actually works                      │
│                                                    │
│       → Lev01 joined the Node                      │
│                                                    │
│  [L]  Lev01                    Today at 2:35 PM    │
│       What's up everyone                           │
│                                                    │
│           ┌──────────────────────┐                 │
│           │   ↓ New messages     │  ← floating     │
│           └──────────────────────┘                 │
│                                                    │
│  kdogg is typing...                                │
├────────────────────────────────────────────────────┤
│  Message #general                          [Send]  │
└────────────────────────────────────────────────────┘
```

---

### VERIFICATION CHECKLIST

1. **Send message** — Type text, press Enter, message appears immediately in the list
2. **Receive message** — Send from second user, message appears in real-time on first user's screen
3. **Message grouping** — Send 3 messages quickly from same user, they group (no repeated avatar/name)
4. **New group after gap** — Wait 5+ minutes (or adjust constant for testing), next message starts new group
5. **Auto-scroll** — New messages scroll into view when at bottom
6. **Scroll up preservation** — Scroll up to read history, new messages do NOT force scroll down
7. **New messages banner** — When scrolled up and new message arrives, floating "New messages ↓" appears
8. **Click banner** — Clicking it scrolls to bottom and dismisses
9. **Typing indicator** — Start typing on user A, "A is typing..." appears on user B's screen
10. **Typing auto-clear** — Stop typing, indicator disappears within 3-5 seconds
11. **Unread badges** — Switch to #welcome channel, send message in #general from other user, badge appears on #general
12. **Clear unread** — Click #general, badge clears
13. **Channel switch** — Switch between channels, messages load correctly for each
14. **System messages** — When a user joins, system message appears in #general
15. **Shift+Enter** — Creates new line without sending
16. **Empty channel** — Shows welcome state with channel name and topic
17. **Timestamps** — Relative times display correctly, full timestamp on hover
18. **Date separators** — Messages from different days have date separator between them
19. **`pnpm lint`** — Clean
20. **`pnpm test`** — All tests pass

---

### PERFORMANCE NOTES

- Keep message arrays under 500 messages per channel in memory. If a channel exceeds this, trim the oldest messages (they can be re-fetched from history if the user scrolls up).
- Use React.memo on MessageItem and MessageGroup to prevent unnecessary re-renders.
- The message subscription will fire for every message from every peer — deduplicate in the store.
- Typing indicator subscriptions can be noisy — debounce state updates.

---

### NEXT MILESTONE

Once 1.5 is verified, proceed to **Milestone 1.6: Direct Messages** which will:
- E2E encrypted DM conversations via SEA
- DM conversation list in a dedicated sidebar section
- DM conversation creation (search/select user by public key)
- Same message components reused for DM view
- Unread indicators for DMs
