import { useState, useRef, useEffect } from "react";
import { Bell, Check, Trash2, X, AtSign, MessageSquare } from "lucide-react";
import { useNotificationStore } from "../../stores/notification-store";
import { useNodeStore } from "../../stores/node-store";
import { useNavigationStore } from "../../stores/navigation-store";
import { useDisplayName } from "../../hooks/useDisplayName";
import type { AppNotification } from "@nodes/core";
import { formatRelativeTime } from "../../utils/time";

/**
 * NotificationCenter provides a dropdown panel showing recent notifications
 * with actions to mark as read, clear, and navigate to messages
 */
export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const notifications = useNotificationStore((s) => s.notifications);
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const markAsRead = useNotificationStore((s) => s.markAsRead);
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);
  const clearNotification = useNotificationStore((s) => s.clearNotification);
  const clearAllNotifications = useNotificationStore((s) => s.clearAllNotifications);

  const setActiveNode = useNodeStore((s) => s.setActiveNode);
  const setActiveChannel = useNodeStore((s) => s.setActiveChannel);
  const setViewMode = useNavigationStore((s) => s.setViewMode);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Handle clicking a notification to navigate
  const handleNotificationClick = (notification: AppNotification) => {
    if (notification.nodeId && notification.channelId) {
      setViewMode("node");
      setActiveNode(notification.nodeId);
      setActiveChannel(notification.channelId);
    } else if (notification.type === "dm") {
      setViewMode("dm");
      // DM navigation would need conversation ID
    }

    markAsRead(notification.id);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      {/* Bell button with badge */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span 
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center text-xs font-bold text-white rounded-full px-1"
            style={{ backgroundColor: '#ff2d55' }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel - opens UPWARD since we're in the bottom status bar */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 bottom-full mb-2 w-80 max-h-96 bg-depth-secondary border border-surface-border rounded-lg shadow-lg overflow-hidden z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
            <h3 className="font-semibold text-text-primary">Notifications</h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllAsRead()}
                  className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-hover rounded transition-colors"
                  title="Mark all as read"
                >
                  <Check className="w-4 h-4" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={() => clearAllNotifications()}
                  className="p-1.5 text-text-muted hover:text-error hover:bg-surface-hover rounded transition-colors"
                  title="Clear all notifications"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div className="overflow-y-auto max-h-80">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-text-muted">
                <Bell className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onClick={() => handleNotificationClick(notification)}
                  onClear={() => clearNotification(notification.id)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Individual notification item
 */
function NotificationItem({
  notification,
  onClick,
  onClear,
}: {
  notification: AppNotification;
  onClick: () => void;
  onClear: () => void;
}) {
  const { displayName } = useDisplayName(notification.senderKey);
  const senderName = displayName || notification.senderName;

  // Get icon based on notification type
  const Icon = notification.type === "dm" ? MessageSquare : AtSign;
  
  // Get accent color based on type
  const getTypeColor = () => {
    switch (notification.type) {
      case "mention":
        return "text-accent-primary";
      case "everyone":
        return "text-warning";
      case "here":
        return "text-success";
      case "dm":
        return "text-info";
      default:
        return "text-text-muted";
    }
  };

  return (
    <div
      className={`group flex items-start gap-3 px-4 py-3 hover:bg-surface-hover cursor-pointer transition-colors ${
        !notification.read ? "bg-accent-primary/5" : ""
      }`}
      onClick={onClick}
    >
      {/* Icon */}
      <div className={`mt-0.5 ${getTypeColor()}`}>
        <Icon className="w-4 h-4" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-text-primary text-sm truncate">
            {senderName}
          </span>
          {!notification.read && (
            <span className="w-2 h-2 rounded-full bg-accent-primary shrink-0" />
          )}
        </div>
        
        {notification.nodeName && notification.channelName && (
          <div className="text-xs text-text-muted truncate">
            {notification.nodeName} / #{notification.channelName}
          </div>
        )}
        
        <p className="text-sm text-text-secondary truncate mt-0.5">
          {notification.messagePreview}
        </p>
        
        <span className="text-xs text-text-muted">
          {formatRelativeTime(notification.timestamp)}
        </span>
      </div>

      {/* Clear button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-error rounded transition-all"
        title="Clear notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default NotificationCenter;
