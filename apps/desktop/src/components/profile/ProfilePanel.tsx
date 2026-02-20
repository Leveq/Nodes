import { useState, useEffect, useRef } from "react";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import { Input, Avatar } from "../ui";
import { processAvatarFromBlob } from "../../utils/image-processing";
import { avatarManager } from "@nodes/transport-gun";
import { AvatarCropModal } from "./AvatarCropModal";

interface ProfilePanelProps {
  onClose: () => void;
}

const MAX_DISPLAY_NAME = 32;
const MAX_BIO = 256;
const MAX_STATUS = 64;

/**
 * Panel for editing the current user's profile.
 */
export function ProfilePanel({ onClose }: ProfilePanelProps) {
  const profile = useIdentityStore((s) => s.profile);
  const publicKey = useIdentityStore((s) => s.publicKey);
  const updateProfile = useIdentityStore((s) => s.updateProfile);
  const avatarVersion = useIdentityStore((s) => s.avatarVersion);
  const incrementAvatarVersion = useIdentityStore((s) => s.incrementAvatarVersion);
  const setAvatarCid = useIdentityStore((s) => s.setAvatarCid);
  const addToast = useToastStore((s) => s.addToast);

  const [displayName, setDisplayName] = useState(profile?.data?.displayName || "");
  const [bio, setBio] = useState(profile?.data?.bio || "");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState<string | null>(null); // For crop modal

  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSave = async () => {
    if (!displayName.trim()) {
      addToast("error", "Display name is required.");
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({
        displayName: displayName.trim(),
        bio: bio.trim(),
      });
      addToast("success", "Profile updated");
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

    // Reset input for re-selection
    e.target.value = "";

    // Validate file type
    const validTypes = ["image/png", "image/jpeg", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      addToast("error", "Invalid image type. Use PNG, JPG, GIF, or WebP.");
      return;
    }

    // Validate file size (5MB max before crop)
    if (file.size > 5 * 1024 * 1024) {
      addToast("error", "Image too large. Maximum size is 5MB.");
      return;
    }

    // Create object URL and show crop modal
    const url = URL.createObjectURL(file);
    setCropImageUrl(url);
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    // Cleanup crop modal
    if (cropImageUrl) {
      URL.revokeObjectURL(cropImageUrl);
      setCropImageUrl(null);
    }

    setIsUploadingAvatar(true);
    try {
      // Process the cropped blob (resize to full + small)
      const { full, small } = await processAvatarFromBlob(croppedBlob);

      // Upload to IPFS
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-nodes-surface border border-nodes-border rounded-lg w-full max-w-md shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-nodes-border">
          <h2 className="text-lg font-semibold text-nodes-text">Edit Profile</h2>
          <button
            onClick={onClose}
            className="text-nodes-text-muted hover:text-nodes-text transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-2">
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={handleAvatarChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={isUploadingAvatar ? undefined : handleAvatarClick}
              className={`relative group rounded-full focus:outline-none focus:ring-2 focus:ring-nodes-primary transition-all ${
                isUploadingAvatar ? 'opacity-50 cursor-wait' : 'cursor-pointer hover:ring-2 hover:ring-nodes-primary/50'
              }`}
            >
              <Avatar
                publicKey={publicKey ?? undefined}
                displayName={displayName}
                size="xl"
                avatarVersion={avatarVersion}
                avatarCid={profile?.data.avatar}
              />
              {/* Hover overlay */}
              <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity pointer-events-none">
                {isUploadingAvatar ? (
                  <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                ) : (
                  <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </div>
            </button>
            <span className="text-xs text-nodes-text-muted">
              {isUploadingAvatar ? "Uploading..." : "Click to change avatar"}
            </span>
          </div>

          {/* Display Name */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm text-nodes-text">Display Name</label>
              <span className="text-xs text-nodes-text-muted">
                {displayName.length}/{MAX_DISPLAY_NAME}
              </span>
            </div>
            <Input
              value={displayName}
              onChange={(value) => setDisplayName(value.slice(0, MAX_DISPLAY_NAME))}
              placeholder="Your display name"
            />
          </div>

          {/* Bio */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm text-nodes-text">Bio</label>
              <span className="text-xs text-nodes-text-muted">
                {bio.length}/{MAX_BIO}
              </span>
            </div>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, MAX_BIO))}
              placeholder="Tell us about yourself..."
              className="w-full px-3 py-2 bg-nodes-bg border border-nodes-border rounded-lg text-nodes-text placeholder-nodes-text-muted/50 focus:outline-none focus:border-nodes-primary resize-none h-20"
            />
          </div>

          {/* Status Message */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-sm text-nodes-text">Status Message</label>
              <span className="text-xs text-nodes-text-muted">
                {statusMessage.length}/{MAX_STATUS}
              </span>
            </div>
            <Input
              value={statusMessage}
              onChange={(value) => setStatusMessage(value.slice(0, MAX_STATUS))}
              placeholder="What are you up to?"
            />
          </div>

          {/* Account Type */}
          <div>
            <label className="text-sm text-nodes-text mb-2 block">Account Type</label>
            <div className="flex gap-2">
              <button
                className={`px-4 py-2 rounded-lg text-sm ${
                  profile?.data?.visibility === "public"
                    ? "bg-nodes-primary text-white"
                    : "bg-nodes-bg text-nodes-text-muted border border-nodes-border"
                }`}
                disabled
              >
                Public
              </button>
              <button
                className={`px-4 py-2 rounded-lg text-sm ${
                  profile?.data?.visibility === "private"
                    ? "bg-nodes-primary text-white"
                    : "bg-nodes-bg text-nodes-text-muted border border-nodes-border"
                }`}
                disabled
              >
                Private
              </button>
            </div>
            <p className="text-xs text-nodes-text-muted mt-1">
              Change visibility in Settings → Privacy
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-nodes-border">
          <button
            onClick={handleSave}
            disabled={isSaving || !displayName.trim()}
            className="w-full bg-nodes-primary hover:bg-nodes-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white py-2 rounded-lg font-medium transition-colors"
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
    </div>
  );
}
