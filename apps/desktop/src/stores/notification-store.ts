import { create } from "zustand";
import type {
  AppNotification,
  NotificationSettings,
  GlobalNotificationSettings,
  NodeNotificationSetting,
  ChannelNotificationSetting,
  ChannelNotificationLevel,
  NodeNotificationLevel,
} from "@nodes/core";

// IndexedDB database name and stores
const DB_NAME = "nodes_notifications";
const NOTIFICATIONS_STORE = "notifications";
const SETTINGS_STORE = "settings";
const DB_VERSION = 1;

// Synchronous dedup tracking - prevents race conditions with async state updates
// This Set persists across renders and must be the single source of truth for dedup
const notifiedMessageIds = new Set<string>();

interface NotificationState {
  // State
  notifications: AppNotification[];
  unreadCount: number;
  settings: NotificationSettings;
  isLoading: boolean;

  // Per-channel mention tracking
  mentionCounts: Record<string, number>; // channelId → mention count

  // Actions
  initialize: () => Promise<void>;
  addNotification: (notification: Omit<AppNotification, "id">) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  clearNotification: (notificationId: string) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  
  // Mention tracking
  incrementMentionCount: (channelId: string) => void;
  clearMentionCount: (channelId: string) => void;
  getMentionCount: (channelId: string) => number;

  // Settings management
  updateGlobalSettings: (settings: Partial<GlobalNotificationSettings>) => Promise<void>;
  updateNodeSettings: (nodeId: string, settings: Partial<NodeNotificationSetting>) => Promise<void>;
  updateChannelSettings: (channelId: string, settings: Partial<ChannelNotificationSetting>) => Promise<void>;
  getEffectiveChannelLevel: (channelId: string, nodeId: string) => ChannelNotificationLevel;
  shouldNotify: (nodeId: string, channelId: string, mentionsUser: boolean, mentionsEveryone: boolean) => boolean;
}

// Default settings
const defaultGlobalSettings: GlobalNotificationSettings = {
  desktop: true,
  sound: true,
  dmNotifications: true,
  dnd: false,
  soundChoice: "default",
};

const defaultSettings: NotificationSettings = {
  global: defaultGlobalSettings,
  nodes: {},
  channels: {},
};

// IndexedDB helpers
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create notifications store
      if (!db.objectStoreNames.contains(NOTIFICATIONS_STORE)) {
        const store = db.createObjectStore(NOTIFICATIONS_STORE, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("read", "read", { unique: false });
        store.createIndex("nodeId", "nodeId", { unique: false });
        store.createIndex("channelId", "channelId", { unique: false });
      }

      // Create settings store
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "id" });
      }
    };
  });
}

async function loadNotifications(): Promise<AppNotification[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTIFICATIONS_STORE, "readonly");
    const store = tx.objectStore(NOTIFICATIONS_STORE);
    const index = store.index("timestamp");
    const request = index.openCursor(null, "prev"); // Newest first

    const notifications: AppNotification[] = [];
    const maxNotifications = 100; // Limit stored notifications

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor && notifications.length < maxNotifications) {
        notifications.push(cursor.value);
        cursor.continue();
      } else {
        resolve(notifications);
      }
    };
  });
}

async function saveNotification(notification: AppNotification): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTIFICATIONS_STORE, "readwrite");
    const store = tx.objectStore(NOTIFICATIONS_STORE);
    const request = store.put(notification);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function deleteNotification(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTIFICATIONS_STORE, "readwrite");
    const store = tx.objectStore(NOTIFICATIONS_STORE);
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function clearAllNotificationsDB(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NOTIFICATIONS_STORE, "readwrite");
    const store = tx.objectStore(NOTIFICATIONS_STORE);
    const request = store.clear();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

async function loadSettings(): Promise<NotificationSettings> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, "readonly");
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.get("settings");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      resolve(request.result?.value || defaultSettings);
    };
  });
}

async function saveSettings(settings: NotificationSettings): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, "readwrite");
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.put({ id: "settings", value: settings });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  settings: defaultSettings,
  isLoading: false,
  mentionCounts: {},

  initialize: async () => {
    set({ isLoading: true });
    try {
      const [notifications, settings] = await Promise.all([
        loadNotifications(),
        loadSettings(),
      ]);

      const unreadCount = notifications.filter((n) => !n.read).length;

      set({
        notifications,
        settings,
        unreadCount,
        isLoading: false,
      });
    } catch (err) {
      console.error("Failed to initialize notification store:", err);
      set({ isLoading: false });
    }
  },

  addNotification: async (notification) => {
    // Check current state FIRST - this is synchronous and survives HMR
    // Zustand's get() and set() are synchronous, so this check is atomic
    const existingInState = get().notifications.some(n => n.messageId === notification.messageId);
    if (existingInState) {
      console.log("[NotificationStore] Skipping duplicate (state check) for message:", notification.messageId);
      return;
    }
    
    // Also check module-level Set (faster check for rapid-fire calls in same module instance)
    if (notifiedMessageIds.has(notification.messageId)) {
      console.log("[NotificationStore] Skipping duplicate (Set check) for message:", notification.messageId);
      return;
    }
    
    // Create notification FIRST (before any async) to prevent race conditions
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const fullNotification: AppNotification = {
      ...notification,
      id,
    };
    
    // Add to state SYNCHRONOUSLY before any async work
    // This ensures subsequent calls see it in state immediately
    set((state) => ({
      notifications: [fullNotification, ...state.notifications].slice(0, 100),
      unreadCount: state.unreadCount + 1,
    }));
    
    // Now we can safely add to Set and do async work
    notifiedMessageIds.add(notification.messageId);
    
    // Limit Set size to prevent memory growth
    if (notifiedMessageIds.size > 500) {
      const toDelete = Array.from(notifiedMessageIds).slice(0, 250);
      toDelete.forEach(msgId => notifiedMessageIds.delete(msgId));
    }
    
    console.log("[NotificationStore] Adding notification:", fullNotification.id, "for message:", notification.messageId);
    
    // Increment mention count for the channel (handled here to ensure it only happens once after dedup)
    if (notification.channelId) {
      console.log("[NotificationStore] Incrementing mention count for channel:", notification.channelId);
      get().incrementMentionCount(notification.channelId);
    }

    // Save to IndexedDB (async, but state is already updated)
    await saveNotification(fullNotification);

    return;
  },

  markAsRead: async (notificationId) => {
    const { notifications } = get();
    const notification = notifications.find((n) => n.id === notificationId);
    if (!notification || notification.read) return;

    const updated = { ...notification, read: true };
    await saveNotification(updated);

    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === notificationId ? updated : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  markAllAsRead: async () => {
    const { notifications } = get();
    const unread = notifications.filter((n) => !n.read);

    // Update all in IndexedDB
    for (const n of unread) {
      await saveNotification({ ...n, read: true });
    }

    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  clearNotification: async (notificationId) => {
    const { notifications } = get();
    const notification = notifications.find((n) => n.id === notificationId);
    if (!notification) return;

    await deleteNotification(notificationId);

    // Also decrement the mention count for this channel
    const channelId = notification.channelId;
    if (channelId) {
      const currentCount = get().mentionCounts[channelId] || 0;
      if (currentCount > 0) {
        set((state) => ({
          mentionCounts: {
            ...state.mentionCounts,
            [channelId]: Math.max(0, currentCount - 1),
          },
        }));
        // If count is now 0, remove the key entirely
        if (currentCount - 1 <= 0) {
          get().clearMentionCount(channelId);
        }
      }
    }

    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== notificationId),
      unreadCount: notification.read
        ? state.unreadCount
        : Math.max(0, state.unreadCount - 1),
    }));
  },

  clearAllNotifications: async () => {
    await clearAllNotificationsDB();
    set({ notifications: [], unreadCount: 0, mentionCounts: {} });
  },

  // Mention tracking
  incrementMentionCount: (channelId) => {
    console.log("[NotificationStore] incrementMentionCount for channel:", channelId);
    set((state) => {
      const newCount = (state.mentionCounts[channelId] || 0) + 1;
      console.log("[NotificationStore] New mention count for", channelId, ":", newCount);
      return {
        mentionCounts: {
          ...state.mentionCounts,
          [channelId]: newCount,
        },
      };
    });
  },

  clearMentionCount: (channelId) => {
    console.log("[NotificationStore] clearMentionCount for channel:", channelId);
    console.log("[NotificationStore] Current mentionCounts:", get().mentionCounts);
    set((state) => {
      const { [channelId]: removed, ...rest } = state.mentionCounts;
      console.log("[NotificationStore] Removed count:", removed, "remaining:", rest);
      return { mentionCounts: rest };
    });
  },

  getMentionCount: (channelId) => {
    return get().mentionCounts[channelId] || 0;
  },

  // Settings management
  updateGlobalSettings: async (updates) => {
    const { settings } = get();
    const newSettings: NotificationSettings = {
      ...settings,
      global: { ...settings.global, ...updates },
    };

    await saveSettings(newSettings);
    set({ settings: newSettings });
  },

  updateNodeSettings: async (nodeId, updates) => {
    const { settings } = get();
    const current = settings.nodes[nodeId] || {
      level: "all" as NodeNotificationLevel,
      suppressEveryone: false,
    };

    const newSettings: NotificationSettings = {
      ...settings,
      nodes: {
        ...settings.nodes,
        [nodeId]: { ...current, ...updates },
      },
    };

    await saveSettings(newSettings);
    set({ settings: newSettings });
  },

  updateChannelSettings: async (channelId, updates) => {
    const { settings } = get();
    const current = settings.channels[channelId] || {
      level: "default" as ChannelNotificationLevel,
    };

    const newSettings: NotificationSettings = {
      ...settings,
      channels: {
        ...settings.channels,
        [channelId]: { ...current, ...updates },
      },
    };

    await saveSettings(newSettings);
    set({ settings: newSettings });
  },

  getEffectiveChannelLevel: (channelId, nodeId) => {
    const { settings } = get();

    // Channel-specific setting takes priority
    const channelSetting = settings.channels[channelId];
    if (channelSetting && channelSetting.level !== "default") {
      return channelSetting.level;
    }

    // Fall back to node setting
    const nodeSetting = settings.nodes[nodeId];
    if (nodeSetting) {
      return nodeSetting.level; // Node levels are compatible with channel levels
    }

    // Default: all notifications
    return "all";
  },

  shouldNotify: (nodeId, channelId, mentionsUser, mentionsEveryone) => {
    const { settings, getEffectiveChannelLevel } = get();

    // DND mode blocks all
    if (settings.global.dnd) {
      return false;
    }

    // Get effective level for this channel
    const level = getEffectiveChannelLevel(channelId, nodeId);

    switch (level) {
      case "all":
        return true;
      case "mentions":
        // Check if @everyone is suppressed for this node
        const nodeSetting = settings.nodes[nodeId];
        if (nodeSetting?.suppressEveryone && mentionsEveryone && !mentionsUser) {
          return false;
        }
        return mentionsUser || mentionsEveryone;
      case "nothing":
        return false;
      default:
        return true;
    }
  },
}));
