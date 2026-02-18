/**
 * Notification Manager Service
 * Handles processing messages for mentions and triggering desktop notifications
 */

import type { TransportMessage } from "@nodes/transport";
import type { NotificationType, AppNotification } from "@nodes/core";
import {
  mentionsUser,
  mentionsEveryone,
  mentionsHere,
} from "@nodes/core";
import { useNotificationStore } from "../stores/notification-store";
import { useIdentityStore } from "../stores/identity-store";
import { useNodeStore } from "../stores/node-store";

// Audio for notification sounds
let notificationSound: HTMLAudioElement | null = null;

// Track if we've requested notification permission
let permissionRequested = false;

/**
 * Initialize notification permissions
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (permissionRequested) {
    return Notification.permission === "granted";
  }

  permissionRequested = true;

  if (!("Notification" in window)) {
    console.warn("This browser does not support desktop notifications");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  return false;
}

/**
 * Initialize notification sound
 */
export function initNotificationSound(soundPath: string = "/sounds/notification.mp3"): void {
  try {
    notificationSound = new Audio(soundPath);
    notificationSound.volume = 0.5;
  } catch (err) {
    console.error("Failed to initialize notification sound:", err);
  }
}

// Debounce notification sounds
let lastSoundTime = 0;
const SOUND_DEBOUNCE_MS = 2000;

/**
 * Play a synthesized notification tone (Web Audio API fallback)
 */
function playWebAudioNotification(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880; // A5 note
    osc.type = "sine";
    gain.gain.value = 0.3;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // Audio context not available, ignore
  }
}

/**
 * Play notification sound with debounce
 */
export function playNotificationSound(): void {
  const settings = useNotificationStore.getState().settings;

  if (!settings.global.sound || settings.global.dnd) {
    return;
  }

  // Debounce rapid notifications
  const now = Date.now();
  if (now - lastSoundTime < SOUND_DEBOUNCE_MS) {
    return;
  }
  lastSoundTime = now;

  // Try HTML Audio first, fall back to Web Audio API
  if (notificationSound) {
    notificationSound.currentTime = 0;
    notificationSound.play().catch(() => {
      // Autoplay blocked, try Web Audio as fallback
      playWebAudioNotification();
    });
  } else {
    playWebAudioNotification();
  }
}

/**
 * Show a desktop notification
 */
export async function showDesktopNotification(
  title: string,
  body: string,
  options?: {
    icon?: string;
    tag?: string;
    onClick?: () => void;
  }
): Promise<void> {
  const settings = useNotificationStore.getState().settings;

  if (!settings.global.desktop || settings.global.dnd) {
    return;
  }

  // Check permission
  if (Notification.permission !== "granted") {
    const granted = await requestNotificationPermission();
    if (!granted) return;
  }

  try {
    const notification = new Notification(title, {
      body,
      icon: options?.icon || "/icons/128x128.png",
      tag: options?.tag,
      silent: true, // We handle our own sound
    });

    if (options?.onClick) {
      notification.onclick = () => {
        options.onClick?.();
        notification.close();
        // Focus the window
        window.focus();
      };
    }

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000);
  } catch (err) {
    console.error("Failed to show notification:", err);
  }
}

/**
 * Determine notification type from message content
 */
export function getNotificationType(
  content: string,
  userPublicKey: string
): NotificationType | null {
  if (mentionsUser(content, userPublicKey)) {
    return "mention";
  }
  if (mentionsEveryone(content)) {
    return "everyone";
  }
  if (mentionsHere(content)) {
    return "here";
  }
  return null;
}

/**
 * Process an incoming message for mentions and create notification if needed
 */
export async function processMessageForNotification(
  message: TransportMessage,
  context: {
    nodeId: string;
    nodeName: string;
    channelId: string;
    channelName: string;
    senderName: string;
  }
): Promise<void> {
  console.log("[NotificationManager] Processing message:", message.id, message.content.slice(0, 50));
  
  const identity = useIdentityStore.getState();
  const notificationStore = useNotificationStore.getState();

  // Don't notify for own messages
  if (!identity.keypair || message.authorKey === identity.keypair.pub) {
    console.log("[NotificationManager] Skipping - own message or no keypair");
    return;
  }

  // Check if user is already viewing this channel
  // We get activeNodeId and activeChannelId from node-store, not navigation-store
  const nodeStore = useNodeStore.getState();
  const isViewingChannel =
    nodeStore.activeNodeId === context.nodeId &&
    nodeStore.activeChannelId === context.channelId;
    
  console.log("[NotificationManager] Channel view check:", {
    activeNodeId: nodeStore.activeNodeId,
    activeChannelId: nodeStore.activeChannelId,
    contextNodeId: context.nodeId,
    contextChannelId: context.channelId,
    isViewingChannel
  });

  // Determine if this message mentions the user
  const userKey = identity.keypair.pub;
  const isMentioned = mentionsUser(message.content, userKey);
  const isEveryoneMention = mentionsEveryone(message.content);
  const isHereMention = mentionsHere(message.content);
  
  console.log("[NotificationManager] Mention check:", { isMentioned, isEveryoneMention, isHereMention, userKey: userKey.slice(0, 10) });

  // Determine notification type
  const notificationType = getNotificationType(message.content, userKey);
  
  // If no relevant mention, skip
  if (!notificationType) {
    console.log("[NotificationManager] No notification type determined");
    return;
  }
  
  console.log("[NotificationManager] Notification type:", notificationType);

  // Check if we should notify based on settings
  const shouldNotify = notificationStore.shouldNotify(
    context.nodeId,
    context.channelId,
    isMentioned,
    isEveryoneMention || isHereMention
  );

  if (!shouldNotify) {
    console.log("[NotificationManager] shouldNotify returned false");
    return;
  }

  console.log("[NotificationManager] Will create notification, isViewingChannel:", isViewingChannel);

  // Create app notification
  // Note: mention count increment is handled inside addNotification after dedup check
  const appNotification: Omit<AppNotification, "id"> = {
    type: notificationType,
    nodeId: context.nodeId,
    nodeName: context.nodeName,
    channelId: context.channelId,
    channelName: context.channelName,
    senderKey: message.authorKey,
    senderName: context.senderName,
    messageId: message.id,
    messagePreview: truncateMessage(message.content, 100),
    timestamp: message.timestamp,
    read: false,
  };

  await notificationStore.addNotification(appNotification);
  console.log("[NotificationManager] Added notification to store:", appNotification);

  // Show desktop notification if not viewing current channel
  if (!isViewingChannel) {
    const title = `${context.senderName} in #${context.channelName}`;
    const body = stripMentionTokens(message.content).slice(0, 200);

    await showDesktopNotification(title, body, {
      tag: `${context.nodeId}-${context.channelId}`,
      onClick: () => {
        // Navigate to the channel
        useNodeStore.getState().setActiveNode(context.nodeId);
        useNodeStore.getState().setActiveChannel(context.channelId);
      },
    });

    playNotificationSound();
  }
}

/**
 * Process DM message for notification
 */
export async function processDMForNotification(
  message: TransportMessage,
  senderName: string
): Promise<void> {
  const identity = useIdentityStore.getState();
  const notificationStore = useNotificationStore.getState();

  // Don't notify for own messages
  if (!identity.keypair || message.authorKey === identity.keypair.pub) {
    return;
  }

  const settings = notificationStore.settings;
  if (!settings.global.dmNotifications || settings.global.dnd) {
    return;
  }

  // Create app notification
  const appNotification: Omit<AppNotification, "id"> = {
    type: "dm",
    senderKey: message.authorKey,
    senderName: senderName,
    messageId: message.id,
    messagePreview: truncateMessage(message.content, 100),
    timestamp: message.timestamp,
    read: false,
  };

  await notificationStore.addNotification(appNotification);

  // Show desktop notification
  const title = `DM from ${senderName}`;
  const body = message.content.slice(0, 200);

  await showDesktopNotification(title, body, {
    tag: `dm-${message.authorKey}`,
  });

  playNotificationSound();
}

/**
 * Helper to truncate message for preview
 */
function truncateMessage(content: string, maxLength: number): string {
  const stripped = stripMentionTokens(content);
  if (stripped.length <= maxLength) {
    return stripped;
  }
  return stripped.slice(0, maxLength - 3) + "...";
}

/**
 * Strip mention tokens for display
 */
function stripMentionTokens(content: string): string {
  return content
    .replace(/<@([a-zA-Z0-9_.-]+)>/g, "@user")
    .replace(/<@&([a-zA-Z0-9_.-]+)>/g, "@role")
    .replace(/<@everyone>/g, "@everyone")
    .replace(/<@here>/g, "@here");
}

/**
 * Initialize the notification manager
 */
export async function initNotificationManager(): Promise<void> {
  // Initialize notification store
  await useNotificationStore.getState().initialize();

  // Request permission
  await requestNotificationPermission();

  // Initialize sound
  initNotificationSound();
}
