import { useState, useRef, useEffect } from "react";
import { Modal } from "./Modal";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import { useTransport } from "../../providers/TransportProvider";
import { getStatusColor } from "../../utils/status";
import { processAvatarFromBlob } from "../../utils/image-processing";
import { avatarManager } from "@nodes/transport-gun";
import { Avatar } from "../ui";
import { AvatarCropModal } from "../profile/AvatarCropModal";
import type { UserStatus } from "@nodes/core";

interface EditProfileModalProps {
  onClose: () => void;
  onSave?: () => void;
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
export function EditProfileModal({ onClose, onSave }: EditProfileModalProps) {
  const profile = useIdentityStore((s) => s.profile);
  const publicKey = useIdentityStore((s) => s.publicKey);
  const updateProfile = useIdentityStore((s) => s.updateProfile);
  const avatarVersion = useIdentityStore((s) => s.avatarVersion);
  const incrementAvatarVersion = useIdentityStore((s) => s.incrementAvatarVersion);
  const setAvatarCid = useIdentityStore((s) => s.setAvatarCid);
  const addToast = useToastStore((s) => s.addToast);
  const transport = useTransport();

  const [displayName, setDisplayName] = useState(profile?.data.displayName || "");
  const [bio, setBio] = useState(profile?.data.bio || "");
  const initialStatus = (profile?.data.status as UserStatus) || "online";
  const [status, setStatus] = useState<UserStatus>(initialStatus);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);

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
      onSave?.();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update profile";
      addToast("error", message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarClick = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = "";

    const validTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      addToast("error", "Invalid image type. Use PNG, JPG, GIF, or WebP.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      addToast("error", "Image too large. Maximum size is 5MB.");
      return;
    }

    const url = URL.createObjectURL(file);
    setCropImageUrl(url);
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    if (cropImageUrl) {
      URL.revokeObjectURL(cropImageUrl);
      setCropImageUrl(null);
    }

    setIsUploadingAvatar(true);
    try {
      const { full, small } = await processAvatarFromBlob(croppedBlob);
      const { full: fullCid } = await avatarManager.uploadAvatar(full, small);
      
      // Update the avatar CID in the store for persistence
      setAvatarCid(fullCid);
      
      // Increment avatar version to trigger re-fetch in all Avatar components
      incrementAvatarVersion();
      addToast("success", "Avatar updated!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to upload avatar";
      addToast("error", message);
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleCropCancel = () => {
    if (cropImageUrl) {
      URL.revokeObjectURL(cropImageUrl);
      setCropImageUrl(null);
    }
  };

  return (
    <Modal title="Edit Profile" onClose={onClose} width="md">
      <div className="space-y-6">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={handleAvatarChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={handleAvatarClick}
            disabled={isUploadingAvatar}
            className="relative group cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 rounded-full focus:outline-none focus:ring-2 focus:ring-nodes-primary hover:ring-2 hover:ring-nodes-primary/50 transition-all"
          >
            <Avatar
              publicKey={publicKey ?? undefined}
              displayName={displayName}
              size="lg"
              showPresence
              presenceStatus={status}
              avatarVersion={avatarVersion}
              avatarCid={profile?.data.avatar}
            />
            {/* Hover overlay */}
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
              {isUploadingAvatar ? (
                <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </div>
          </button>
          <div className="flex-1">
            <p className="text-sm text-nodes-text mb-1">{displayName || "Your Name"}</p>
            <p className="text-xs text-nodes-text-muted">
              {isUploadingAvatar ? "Uploading..." : "Click avatar to change"}
            </p>
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

      {/* Avatar Crop Modal */}
      {cropImageUrl && (
        <AvatarCropModal
          imageUrl={cropImageUrl}
          onCrop={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}
    </Modal>
  );
}
