import { useState } from "react";
import { useIdentityStore } from "../../stores/identity-store";
import { StatusSelector } from "./StatusSelector";
import type { UserStatus } from "@nodes/core";

interface UserPanelProps {
  onOpenProfile: () => void;
  onOpenSettings: () => void;
}

/**
 * User panel shown at the bottom of sidebars.
 * Displays current user info, status, and settings access.
 */
export function UserPanel({ onOpenProfile, onOpenSettings }: UserPanelProps) {
  const profile = useIdentityStore((s) => s.profile);
  const publicKey = useIdentityStore((s) => s.publicKey);
  const [currentStatus, setCurrentStatus] = useState<UserStatus>(
    (profile?.data?.status as UserStatus) || "online"
  );

  const displayName = profile?.data?.displayName || publicKey?.slice(0, 8) || "User";
  const statusMessage = profile?.data?.bio?.slice(0, 40) || "";
  const initial = displayName[0]?.toUpperCase() || "?";

  return (
    <div className="h-14 px-2 bg-[#1a1a28] border-t border-nodes-border flex items-center gap-2">
      {/* Avatar (clickable) */}
      <button
        onClick={onOpenProfile}
        className="w-8 h-8 rounded-full bg-nodes-primary/20 flex items-center justify-center shrink-0 hover:bg-nodes-primary/30 transition-colors"
        title="Edit Profile"
      >
        <span className="text-nodes-primary font-medium text-sm">{initial}</span>
      </button>

      {/* Name and status */}
      <div className="flex-1 min-w-0">
        <button
          onClick={onOpenProfile}
          className="flex items-center gap-1.5 hover:underline"
        >
          <span className="text-nodes-text text-sm font-medium truncate">
            {displayName}
          </span>
          <StatusSelector
            currentStatus={currentStatus}
            onStatusChange={setCurrentStatus}
          />
        </button>
        {statusMessage && (
          <p className="text-nodes-text-muted text-xs truncate">{statusMessage}</p>
        )}
      </div>

      {/* Action icons */}
      <div className="flex items-center gap-1">
        {/* Microphone (placeholder) */}
        <button
          className="p-1.5 text-nodes-text-muted opacity-50 cursor-not-allowed"
          title="Voice (Phase 2)"
          disabled
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>

        {/* Speaker (placeholder) */}
        <button
          className="p-1.5 text-nodes-text-muted opacity-50 cursor-not-allowed"
          title="Audio (Phase 2)"
          disabled
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
          </svg>
        </button>

        {/* Settings */}
        <button
          onClick={onOpenSettings}
          className="p-1.5 text-nodes-text-muted hover:text-nodes-text transition-colors"
          title="Settings (Ctrl+,)"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
