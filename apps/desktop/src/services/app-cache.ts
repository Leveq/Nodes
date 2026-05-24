/**
 * App-level IndexedDB cache for fast startup.
 * 
 * Stores frequently accessed data (messages, channels, members, etc.)
 * so the app can render immediately from cache while syncing from Gun.
 * 
 * Pattern: Cache-first, network-update
 * 1. Read from IndexedDB (instant)
 * 2. Render cached data
 * 3. Fetch from Gun (background)
 * 4. Update cache with fresh data
 */

const DB_NAME = "nodes-app-cache";
const DB_VERSION = 1;
const STORE_NAME = "cache";

// Cache schema version - bump this to invalidate all cached data
const CACHE_SCHEMA_VERSION = 1;

let db: IDBDatabase | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: number;
}

async function openDb(): Promise<IDBDatabase> {
  if (db) return db;
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("[AppCache] Failed to open database:", request.error);
      dbPromise = null;
      reject(request.error);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
  });

  return dbPromise;
}

/**
 * Get cached data by key.
 * Returns null if not found or on error.
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const database = await openDb();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onerror = () => {
        console.warn("[AppCache] Failed to read:", key, request.error);
        resolve(null);
      };

      request.onsuccess = () => {
        const entry = request.result as CacheEntry<T> | undefined;
        if (!entry) {
          resolve(null);
          return;
        }

        // Invalidate if schema version changed
        if (entry.version !== CACHE_SCHEMA_VERSION) {
          resolve(null);
          return;
        }

        resolve(entry.data);
      };
    });
  } catch (err) {
    console.warn("[AppCache] Error reading cache:", err);
    return null;
  }
}

/**
 * Set cached data by key.
 */
export async function setCache<T>(key: string, data: T): Promise<void> {
  try {
    const database = await openDb();
    return new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);

      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        version: CACHE_SCHEMA_VERSION,
      };

      const request = store.put(entry, key);

      request.onerror = () => {
        console.warn("[AppCache] Failed to write:", key, request.error);
        reject(request.error);
      };

      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.warn("[AppCache] Error writing cache:", err);
  }
}

/**
 * Delete a specific cache entry.
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    const database = await openDb();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onerror = () => {
        console.warn("[AppCache] Failed to delete:", key, request.error);
        resolve();
      };

      request.onsuccess = () => resolve();
    });
  } catch (err) {
    console.warn("[AppCache] Error deleting cache:", err);
  }
}

/**
 * Clear all cached data.
 * Call on logout or identity switch.
 */
export async function clearCache(): Promise<void> {
  try {
    const database = await openDb();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => {
        console.warn("[AppCache] Failed to clear:", request.error);
        resolve();
      };

      request.onsuccess = () => {
        console.log("[AppCache] Cache cleared");
        resolve();
      };
    });
  } catch (err) {
    console.warn("[AppCache] Error clearing cache:", err);
  }
}

/**
 * Get cache entry with metadata (timestamp).
 * Useful for checking staleness.
 */
export async function getCacheWithMeta<T>(
  key: string
): Promise<{ data: T; timestamp: number } | null> {
  try {
    const database = await openDb();
    return new Promise((resolve) => {
      const tx = database.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onerror = () => {
        resolve(null);
      };

      request.onsuccess = () => {
        const entry = request.result as CacheEntry<T> | undefined;
        if (!entry || entry.version !== CACHE_SCHEMA_VERSION) {
          resolve(null);
          return;
        }
        resolve({ data: entry.data, timestamp: entry.timestamp });
      };
    });
  } catch {
    return null;
  }
}

/**
 * Check if cached data is stale (older than TTL).
 */
export async function isCacheStale(key: string, ttlMs: number): Promise<boolean> {
  const meta = await getCacheWithMeta(key);
  if (!meta) return true;
  return Date.now() - meta.timestamp > ttlMs;
}

// ============================================
// Cache key helpers
// ============================================

export const CacheKeys = {
  // Nodes the user belongs to
  userNodes: () => "user-nodes",
  
  // Channels for a specific Node
  channels: (nodeId: string) => `channels:${nodeId}`,
  
  // Members for a specific Node
  members: (nodeId: string) => `members:${nodeId}`,
  
  // Messages for a specific channel (capped at 100)
  messages: (channelId: string) => `messages:${channelId}`,
  
  // DM conversations list
  dmConversations: () => "dm-conversations",
  
  // DM messages for a conversation (capped at 100)
  dmMessages: (conversationId: string) => `dm-messages:${conversationId}`,
  
  // Display name cache
  displayNames: () => "display-names",
  
  // Reactions for a message
  reactions: (messageId: string) => `reactions:${messageId}`,
  
  // Friends list
  friends: () => "friends",
  
  // Blocked users list
  blockedUsers: () => "blocked-users",
  
  // Voice/audio settings
  voiceSettings: () => "voice-settings",
};

// Maximum messages to cache per channel
export const MAX_CACHED_MESSAGES = 100;
