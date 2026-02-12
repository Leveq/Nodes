# PERFORMANCE OPTIMIZATION — GUNJS SUBSCRIPTION BATCHING
## Nodes: Decentralized Communication Platform

---

### ⚠️ THIS IS A CRITICAL FIX
### The console warning "syncing 1K+ records a second, faster than DOM can update" indicates that every GunJS `.map().on()` callback is triggering an individual React state update and re-render. With 200 messages in a channel, that's 200 synchronous re-renders on channel load. This WILL cause visible jank, input lag, and dropped frames as data grows. Fix it now.

---

### THE PROBLEM

GunJS `.map().on()` fires a callback for EVERY existing record in the graph (replay) AND for every new record. Each callback currently calls `addMessage()` or similar, which calls Zustand's `set()`, which triggers a React re-render. The result:

```
Channel has 200 messages
→ .map().on() fires 200 times in rapid succession
→ 200 Zustand set() calls
→ 200 React re-renders
→ DOM thrashes, frames drop, console screams
```

This affects EVERY subscription in the app:
- Channel message subscriptions (GunMessageTransport)
- DM message subscriptions (DMManager)
- Member list subscriptions (NodeManager)
- Channel list subscriptions (NodeManager)
- Presence subscriptions (GunPresenceTransport)
- Friend list subscriptions (SocialManager)
- Request inbox subscriptions (SocialManager)

---

### THE FIX: THREE-LAYER APPROACH

#### LAYER 1: SEPARATE HISTORY LOAD FROM LIVE SUBSCRIPTION

The root cause is using `.map().on()` for both initial data load AND real-time updates. Split them:

**Pattern — apply to ALL subscription-based data loading:**

```typescript
/**
 * BEFORE (broken):
 * .map().on() replays ALL existing data + subscribes to new data
 * Every replay fires a state update = DOM thrashing
 */

// ❌ DON'T DO THIS
gun.get("channels").get(channelId).get("messages").map().on((data) => {
  messageStore.addMessage(channelId, parseMessage(data));
});

/**
 * AFTER (correct):
 * Step 1: Load history with .map().once() — fires once per record, no subscription
 * Step 2: Collect all results, set state ONCE
 * Step 3: THEN subscribe to new data only with .map().on() + timestamp filter
 */

// ✅ DO THIS
async function loadAndSubscribe(channelId: string): Unsubscribe {
  // Step 1: Load history (non-reactive, fires once per existing record)
  const history: TransportMessage[] = [];

  await new Promise<void>((resolve) => {
    let timer = setTimeout(resolve, 2000); // Safety timeout

    gun.get("channels").get(channelId).get("messages").map().once((data: any) => {
      if (!data || !data.id || !data.content) return;
      history.push(parseMessage(data));

      // Reset timer on each record (debounce completion)
      clearTimeout(timer);
      timer = setTimeout(resolve, 300);
    });
  });

  // Step 2: Single state update with all history
  const sorted = history.sort((a, b) => a.timestamp - b.timestamp);
  messageStore.setMessages(channelId, sorted);

  // Step 3: Subscribe to NEW messages only
  const latestTimestamp = sorted.length > 0
    ? sorted[sorted.length - 1].timestamp
    : Date.now();
  const seenIds = new Set(sorted.map(m => m.id));

  const ref = gun.get("channels").get(channelId).get("messages").map().on((data: any) => {
    if (!data || !data.id || !data.content) return;
    if (seenIds.has(data.id)) return;

    seenIds.add(data.id);
    messageStore.addMessage(channelId, parseMessage(data));
  });

  return () => ref.off();
}
```

**Apply this pattern to:**
1. `GunMessageTransport.subscribe()` — channel messages
2. `GunMessageTransport.getHistory()` — refactor to use the same load pattern
3. `DMManager.subscribe()` — DM messages
4. `DMManager.getHistory()` — same refactor
5. `NodeManager.getMembers()` — member list
6. `NodeManager.getChannels()` — channel list
7. `NodeManager.getUserNodes()` — user's Node list
8. `NodeManager.subscribeMemberChanges()` — live member updates
9. `NodeManager.subscribeChannelChanges()` — live channel updates
10. `SocialManager.getFriends()` — friend list
11. `SocialManager.subscribeInbox()` — request inbox
12. `SocialManager.subscribeOutgoingRequests()` — outgoing request status

---

#### LAYER 2: BATCH LIVE UPDATES WITH requestAnimationFrame

Even after separating history from live subscriptions, rapid incoming messages (e.g., active channel with many users) can still cause excessive renders. Batch live updates:

**Create a utility: apps/desktop/src/utils/batch-updater.ts:**

```typescript
/**
 * BatchUpdater collects rapid-fire updates and flushes them
 * in a single batch on the next animation frame.
 *
 * Usage:
 *   const batcher = new BatchUpdater<TransportMessage>(
 *     (messages) => messageStore.addMessages(channelId, messages)
 *   );
 *
 *   // In Gun callback:
 *   gun.map().on((data) => batcher.add(parseMessage(data)));
 *
 *   // Cleanup:
 *   batcher.dispose();
 */
export class BatchUpdater<T> {
  private buffer: T[] = [];
  private rafId: number | null = null;
  private flushFn: (items: T[]) => void;

  constructor(flushFn: (items: T[]) => void) {
    this.flushFn = flushFn;
  }

  add(item: T): void {
    this.buffer.push(item);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.rafId !== null) return;

    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (this.buffer.length === 0) return;

      const batch = [...this.buffer];
      this.buffer = [];
      this.flushFn(batch);
    });
  }

  dispose(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    // Flush remaining
    if (this.buffer.length > 0) {
      const batch = [...this.buffer];
      this.buffer = [];
      this.flushFn(batch);
    }
  }
}
```

**Update message store to support batch adds:**

```typescript
// Add to message-store.ts:
addMessages: (channelId: string, messages: TransportMessage[]) => {
  set((state) => {
    const existing = state.messages[channelId] || [];
    const existingIds = new Set(existing.map(m => m.id));
    const newMsgs = messages.filter(m => !existingIds.has(m.id));

    if (newMsgs.length === 0) return state;

    return {
      messages: {
        ...state.messages,
        [channelId]: [...existing, ...newMsgs].sort((a, b) => a.timestamp - b.timestamp),
      },
    };
  });
},
```

**Wire batching into live subscriptions:**

```typescript
// In the live subscription (after history load):
const batcher = new BatchUpdater<TransportMessage>((batch) => {
  messageStore.addMessages(channelId, batch);
});

const ref = gun.get("channels").get(channelId).get("messages").map().on((data: any) => {
  if (!data || !data.id || seenIds.has(data.id)) return;
  seenIds.add(data.id);
  batcher.add(parseMessage(data));
});

return () => {
  ref.off();
  batcher.dispose();
};
```

---

#### LAYER 3: CAP IN-MEMORY MESSAGE ARRAYS

Prevent unbounded memory growth:

```typescript
const MAX_MESSAGES_PER_CHANNEL = 500;

// In setMessages and addMessages, after sorting:
if (channelMessages.length > MAX_MESSAGES_PER_CHANNEL) {
  channelMessages = channelMessages.slice(-MAX_MESSAGES_PER_CHANNEL);
}
```

For DMs, use a lower cap since conversations are typically shorter:
```typescript
const MAX_MESSAGES_PER_DM = 200;
```

When the user scrolls up past the cap, you can lazy-load older messages from history (load-more pattern). This is optional for now but the cap prevents memory bloat.

---

### WHERE TO APPLY EACH FIX

| File | Layer 1 (Split) | Layer 2 (Batch) | Layer 3 (Cap) |
|------|:---:|:---:|:---:|
| GunMessageTransport — subscribe() | ✅ | ✅ | ✅ |
| GunMessageTransport — getHistory() | ✅ | — | ✅ |
| DMManager — subscribe() | ✅ | ✅ | ✅ |
| DMManager — getHistory() | ✅ | — | ✅ |
| NodeManager — getMembers() | ✅ | — | — |
| NodeManager — getChannels() | ✅ | — | — |
| NodeManager — getUserNodes() | ✅ | — | — |
| NodeManager — subscribeMemberChanges() | ✅ | ✅ | — |
| NodeManager — subscribeChannelChanges() | ✅ | ✅ | — |
| GunPresenceTransport — subscribe() | ✅ | ✅ | — |
| SocialManager — getFriends() | ✅ | — | — |
| SocialManager — subscribeInbox() | ✅ | ✅ | — |
| SocialManager — subscribeOutgoingRequests() | ✅ | ✅ | — |

---

### VERIFICATION

1. **Console clean** — No "syncing 1K+ records" warning on any screen
2. **Channel switch** — Messages load without visible jank, smooth skeleton → content transition
3. **Active channel** — Send 20 rapid messages from another user, receiving side stays smooth
4. **Node switch** — Member list and channel list load without frame drops
5. **DM open** — History loads cleanly, no flicker
6. **Memory** — Open a channel with 500+ messages, check memory stays under 100MB
7. **Scroll** — Scrolling through message history is 60fps smooth
8. **No regressions** — All existing functionality still works (real-time messages, presence, typing indicators)

---

### IMPORTANT NOTES

- When refactoring `subscribe()` methods, make sure the returned `Unsubscribe` function also calls `batcher.dispose()` to flush any remaining buffered items
- The `seenIds` Set prevents duplicate processing but will grow unbounded — periodically clear entries older than the cap (or just let it grow, a Set of string IDs is lightweight)
- The debounced history load completion (300ms timeout after last record) is a heuristic — Gun doesn't signal "done loading." If channels are very large, increase to 500ms
- Test with `React.StrictMode` enabled — it double-fires effects which can expose subscription bugs
