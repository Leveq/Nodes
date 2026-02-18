import { useState, useEffect } from "react";
import { Bell, BellOff, Volume2, VolumeX, Moon, Sun } from "lucide-react";
import { useNotificationStore } from "../../stores/notification-store";
import type { GlobalNotificationSettings } from "@nodes/core";

/**
 * NotificationSettings component for global notification preferences
 */
export function NotificationSettings() {
  const settings = useNotificationStore((s) => s.settings);
  const updateGlobalSettings = useNotificationStore((s) => s.updateGlobalSettings);
  const isLoading = useNotificationStore((s) => s.isLoading);

  // Local state for immediate UI feedback
  const [localSettings, setLocalSettings] = useState<GlobalNotificationSettings>(
    settings.global
  );

  // Sync local state when store updates
  useEffect(() => {
    setLocalSettings(settings.global);
  }, [settings.global]);

  // Handle toggle change with debounced save
  const handleToggle = async (key: keyof GlobalNotificationSettings, value: boolean) => {
    setLocalSettings((prev) => ({ ...prev, [key]: value }));
    await updateGlobalSettings({ [key]: value });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-surface-hover rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Desktop Notifications */}
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-text-muted uppercase tracking-wide">
          Desktop Notifications
        </h3>
        <p className="text-xs text-text-muted mb-3">
          Control how and when you receive desktop notifications
        </p>

        <SettingToggle
          icon={localSettings.desktop ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          label="Enable Desktop Notifications"
          description="Show notifications outside the app"
          checked={localSettings.desktop}
          onChange={(v) => handleToggle("desktop", v)}
        />

        <SettingToggle
          icon={localSettings.sound ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          label="Notification Sounds"
          description="Play a sound when you receive a notification"
          checked={localSettings.sound}
          onChange={(v) => handleToggle("sound", v)}
        />
      </div>

      {/* DM Notifications */}
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-text-muted uppercase tracking-wide">
          Direct Messages
        </h3>

        <SettingToggle
          icon={<Bell className="w-5 h-5" />}
          label="DM Notifications"
          description="Receive notifications for direct messages"
          checked={localSettings.dmNotifications}
          onChange={(v) => handleToggle("dmNotifications", v)}
        />
      </div>

      {/* Do Not Disturb */}
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-text-muted uppercase tracking-wide">
          Do Not Disturb
        </h3>

        <SettingToggle
          icon={localSettings.dnd ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
          label="Do Not Disturb Mode"
          description="Mute all notifications and sounds"
          checked={localSettings.dnd}
          onChange={(v) => handleToggle("dnd", v)}
          variant={localSettings.dnd ? "warning" : "default"}
        />
      </div>

      {/* Notification Permission Status */}
      <NotificationPermissionStatus />
    </div>
  );
}

/**
 * Toggle setting row component
 */
function SettingToggle({
  icon,
  label,
  description,
  checked,
  onChange,
  disabled = false,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  variant?: "default" | "warning";
}) {
  const bgClass = variant === "warning" && checked
    ? "bg-warning/10 border-warning/30"
    : "bg-depth-primary border-surface-border";

  return (
    <label
      className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer hover:bg-surface-hover transition-colors ${bgClass} ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      <span className={`text-text-muted ${variant === "warning" && checked ? "text-warning" : ""}`}>
        {icon}
      </span>
      
      <div className="flex-1">
        <div className="font-medium text-text-primary">{label}</div>
        <div className="text-sm text-text-muted">{description}</div>
      </div>

      <div className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? "bg-accent-primary" : "bg-surface-border"
      }`}>
        <div
          className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only"
        />
      </div>
    </label>
  );
}

/**
 * Shows the current notification permission status
 */
function NotificationPermissionStatus() {
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = async () => {
    if ("Notification" in window && Notification.permission === "default") {
      const result = await Notification.requestPermission();
      setPermission(result);
    }
  };

  if (!("Notification" in window)) {
    return (
      <div className="p-4 bg-warning/10 border border-warning/30 rounded-lg text-warning text-sm">
        Desktop notifications are not supported in this browser.
      </div>
    );
  }

  if (permission === "denied") {
    return (
      <div className="p-4 bg-error/10 border border-error/30 rounded-lg text-error text-sm">
        <strong>Notifications Blocked</strong>
        <p className="mt-1">
          You have blocked notifications for this app. To enable them, update your browser settings.
        </p>
      </div>
    );
  }

  if (permission === "default") {
    return (
      <div className="p-4 bg-info/10 border border-info/30 rounded-lg text-sm">
        <div className="flex items-center justify-between">
          <div>
            <strong className="text-text-primary">Enable Notifications</strong>
            <p className="text-text-muted mt-1">
              Allow browser notifications to stay updated.
            </p>
          </div>
          <button
            onClick={requestPermission}
            className="px-4 py-2 bg-accent-primary hover:bg-accent-primary/80 text-white rounded-lg transition-colors"
          >
            Enable
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-success/10 border border-success/30 rounded-lg text-success text-sm flex items-center gap-2">
      <Bell className="w-4 h-4" />
      <span>Desktop notifications are enabled</span>
    </div>
  );
}

export default NotificationSettings;
