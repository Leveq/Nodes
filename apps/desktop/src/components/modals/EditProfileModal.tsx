import { useState } from "react";
import { Modal } from "./Modal";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import { useTransport } from "../../providers/TransportProvider";
import { getStatusColor } from "../../utils/status";
import type { UserStatus } from "@nodes/core";

interface EditProfileModalProps {
  onClose: () => void;
}

const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: "online", label: "Online" },
  { value: "idle", label: "Idle" },
  { value: "dnd", label: "Do Not Disturb" },
  { value: "offline", label: "Invisible" },
];

/**
 * Modal for editing the user's own profile.
 * Allows editing display name, bio, status, and avatar.
 */
export function EditProfileModal({ onClose }: EditProfileModalProps) {
  const profile = useIdentityStore((s) => s.profile);
  const updateProfile = useIdentityStore((s) => s.updateProfile);
  const addToast = useToastStore((s) => s.addToast);
  const transport = useTransport();

  const [displayName, setDisplayName] = useState(profile?.data.displayName || "");
  const [bio, setBio] = useState(profile?.data.bio || "");
  const initialStatus = (profile?.data.status as UserStatus) || "online";
  const [status, setStatus] = useState<UserStatus>(initialStatus);
  const [isSaving, setIsSaving] = useState(false);

  const initial = displayName[0]?.toUpperCase() || "?";

  const handleSave = async () => {
    if (!displayName.trim()) {
      addToast("error", "Display name is required");
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
        status,
      });

      // Broadcast status change via presence transport if status changed
      if (status !== initialStatus && transport?.presence) {
        await transport.presence.setStatus(status);
      }

      addToast("success", "Profile updated");
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update profile";
      addToast("error", message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal title="Edit Profile" onClose={onClose} width="md">
      <div className="space-y-6">
        {/* Avatar preview */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-nodes-primary/20 flex items-center justify-center">
              <span className="text-nodes-primary font-bold text-2xl">{initial}</span>
            </div>
            {/* Status indicator */}
            <div
              className={`absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-nodes-surface ${getStatusColor(status)}`}
            />
          </div>
          <div className="flex-1">
            <p className="text-sm text-nodes-text-muted mb-2">
              Avatar customization coming soon
            </p>
            <button
              disabled
              className="px-3 py-1.5 text-sm bg-nodes-surface text-nodes-text-muted rounded-lg opacity-50 cursor-not-allowed"
            >
              Upload Avatar
            </button>
          </div>
        </div>

        {/* Display Name */}
        <div>
          <label className="block text-sm font-medium text-nodes-text mb-1.5">
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={32}
            className="w-full px-3 py-2 bg-nodes-bg border border-nodes-border rounded-lg text-nodes-text placeholder-nodes-text-muted focus:outline-none focus:border-nodes-primary"
            placeholder="Enter your display name"
          />
          <p className="mt-1 text-xs text-nodes-text-muted">
            {displayName.length}/32 characters
          </p>
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-nodes-text mb-1.5">
            About Me
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={190}
            rows={3}
            className="w-full px-3 py-2 bg-nodes-bg border border-nodes-border rounded-lg text-nodes-text placeholder-nodes-text-muted focus:outline-none focus:border-nodes-primary resize-none"
            placeholder="Tell others about yourself..."
          />
          <p className="mt-1 text-xs text-nodes-text-muted">
            {bio.length}/190 characters
          </p>
        </div>

        {/* Status */}
        <div>
          <label className="block text-sm font-medium text-nodes-text mb-1.5">
            Status
          </label>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setStatus(option.value)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                  status === option.value
                    ? "border-nodes-primary bg-nodes-primary/10"
                    : "border-nodes-border hover:border-nodes-text-muted"
                }`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(option.value)}`} />
                <span className="text-sm text-nodes-text">{option.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-nodes-text-muted hover:text-nodes-text transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || !displayName.trim()}
            className="px-4 py-2 text-sm bg-nodes-primary hover:bg-nodes-primary/90 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
