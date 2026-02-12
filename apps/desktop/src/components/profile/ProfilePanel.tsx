import { useState, useEffect } from "react";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import { Input } from "../ui";

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
  const updateProfile = useIdentityStore((s) => s.updateProfile);
  const addToast = useToastStore((s) => s.addToast);

  const [displayName, setDisplayName] = useState(profile?.data?.displayName || "");
  const [bio, setBio] = useState(profile?.data?.bio || "");
  const [statusMessage, setStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const initial = displayName[0]?.toUpperCase() || "?";

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
          {/* Avatar placeholder */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-20 h-20 rounded-full bg-nodes-primary/20 flex items-center justify-center">
              <span className="text-nodes-primary font-bold text-2xl">{initial}</span>
            </div>
            <button
              disabled
              className="text-sm text-nodes-text-muted cursor-not-allowed"
              title="Avatar upload coming in Phase 2"
            >
              Change (Phase 2)
            </button>
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
    </div>
  );
}
