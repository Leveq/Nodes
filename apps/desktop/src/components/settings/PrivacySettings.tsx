import { useState } from "react";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import type { FieldVisibility } from "@nodes/core";

type ProfileField = "bio" | "avatar" | "status";

const visibilityOptions: { value: FieldVisibility; label: string }[] = [
  { value: "public", label: "Public" },
  { value: "friends", label: "Friends Only" },
  { value: "nobody", label: "Nobody" },
];

/**
 * Privacy settings section: account visibility and per-field visibility controls.
 */
export function PrivacySettings() {
  const profile = useIdentityStore((s) => s.profile);
  const updateProfile = useIdentityStore((s) => s.updateProfile);
  const updateFieldVisibility = useIdentityStore((s) => s.updateFieldVisibility);
  const addToast = useToastStore((s) => s.addToast);

  const [isUpdating, setIsUpdating] = useState(false);

  const currentVisibility = profile?.data?.visibility || "public";
  const fieldVisibility = (profile?.fieldVisibility || {}) as Record<ProfileField, FieldVisibility>;

  const handleAccountVisibilityChange = async (newVisibility: "public" | "private") => {
    setIsUpdating(true);
    try {
      await updateProfile({ visibility: newVisibility });
      addToast("success", `Account changed to ${newVisibility}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update visibility";
      addToast("error", message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleFieldVisibilityChange = async (field: ProfileField, visibility: FieldVisibility) => {
    try {
      await updateFieldVisibility(field, visibility);
      addToast("success", `${field} visibility updated`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update field visibility";
      addToast("error", message);
    }
  };

  return (
    <div className="space-y-8">
      {/* Account Visibility */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Account Visibility</h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Control who can find and view your profile. Public accounts are discoverable, while private accounts are only visible to friends.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => handleAccountVisibilityChange("public")}
            disabled={isUpdating}
            className={`flex-1 max-w-xs px-4 py-3 rounded-lg border-2 transition-colors ${
              currentVisibility === "public"
                ? "border-nodes-primary bg-nodes-primary/10 text-nodes-text"
                : "border-nodes-border bg-nodes-bg text-nodes-text-muted hover:border-nodes-text-muted"
            }`}
          >
            <div className="font-medium mb-1">Public</div>
            <div className="text-xs opacity-70">Anyone can find you</div>
          </button>
          <button
            onClick={() => handleAccountVisibilityChange("private")}
            disabled={isUpdating}
            className={`flex-1 max-w-xs px-4 py-3 rounded-lg border-2 transition-colors ${
              currentVisibility === "private"
                ? "border-nodes-primary bg-nodes-primary/10 text-nodes-text"
                : "border-nodes-border bg-nodes-bg text-nodes-text-muted hover:border-nodes-text-muted"
            }`}
          >
            <div className="font-medium mb-1">Private</div>
            <div className="text-xs opacity-70">Only friends can see you</div>
          </button>
        </div>
      </section>

      {/* Per-Field Visibility */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Field Visibility</h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Control who can see each part of your profile.
        </p>
        <div className="space-y-3">
          {/* Display Name - always public */}
          <div className="flex items-center justify-between py-2">
            <div>
              <span className="text-nodes-text font-medium">Display Name</span>
              <p className="text-xs text-nodes-text-muted">Required for identification</p>
            </div>
            <div className="px-3 py-1.5 bg-nodes-bg border border-nodes-border rounded-lg text-nodes-text-muted text-sm">
              Always Public
            </div>
          </div>

          {/* Bio */}
          <div className="flex items-center justify-between py-2">
            <span className="text-nodes-text font-medium">Bio</span>
            <select
              value={fieldVisibility.bio || "public"}
              onChange={(e) => handleFieldVisibilityChange("bio", e.target.value as FieldVisibility)}
              className="px-3 py-1.5 bg-nodes-bg border border-nodes-border rounded-lg text-nodes-text text-sm focus:outline-none focus:border-nodes-primary"
            >
              {visibilityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div className="flex items-center justify-between py-2">
            <span className="text-nodes-text font-medium">Status</span>
            <select
              value={fieldVisibility.status || "public"}
              onChange={(e) => handleFieldVisibilityChange("status", e.target.value as FieldVisibility)}
              className="px-3 py-1.5 bg-nodes-bg border border-nodes-border rounded-lg text-nodes-text text-sm focus:outline-none focus:border-nodes-primary"
            >
              {visibilityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Avatar */}
          <div className="flex items-center justify-between py-2">
            <span className="text-nodes-text font-medium">Avatar</span>
            <select
              value={fieldVisibility.avatar || "public"}
              onChange={(e) => handleFieldVisibilityChange("avatar", e.target.value as FieldVisibility)}
              className="px-3 py-1.5 bg-nodes-bg border border-nodes-border rounded-lg text-nodes-text text-sm focus:outline-none focus:border-nodes-primary"
            >
              {visibilityOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
    </div>
  );
}
