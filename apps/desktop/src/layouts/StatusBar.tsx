import { useIdentityStore } from "../stores/identity-store";
import { ConnectionStatus, Badge } from "../components/ui";
import { CopyablePublicKey } from "../components/ui/CopyablePublicKey";
import { NotificationCenter } from "../components/notifications";
import { getStatusColor } from "../utils/status";
import type { UserStatus } from "@nodes/core";

interface StatusBarProps {
  onOpenSettings?: () => void;
  onOpenProfile?: () => void;
}

/**
 * StatusBar displays connection state and current user info
 * at the bottom of the app shell.
 */
export function StatusBar({ onOpenSettings, onOpenProfile }: StatusBarProps) {
  const publicKey = useIdentityStore((s) => s.publicKey);
  const profile = useIdentityStore((s) => s.profile);

  if (!publicKey) return null;

  const status = (profile?.data.status as UserStatus) || "online";
  const initial = profile?.data.displayName?.[0]?.toUpperCase() || "?";

  return (
    <div className="h-8 bg-nodes-surface border-t border-nodes-border flex items-center justify-between px-4 text-xs shrink-0">
      <ConnectionStatus />
      <div className="flex items-center gap-3">
        {/* Clickable profile avatar and name */}
        <button
          onClick={onOpenProfile}
          className="flex items-center gap-2 hover:bg-nodes-bg/50 rounded px-1.5 py-0.5 -ml-1.5 transition-colors"
          title="Edit Profile"
        >
          <div className="relative">
            <div className="w-5 h-5 rounded-full bg-nodes-primary/20 flex items-center justify-center">
              <span className="text-nodes-primary font-medium text-[10px]">{initial}</span>
            </div>
            <div className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-nodes-surface ${getStatusColor(status)}`} />
          </div>
          <span className="text-nodes-text">{profile?.data.displayName}</span>
        </button>
        <CopyablePublicKey publicKey={publicKey} />
        {profile?.data.visibility && (
          <Badge variant={profile.data.visibility} size="sm" />
        )}
        <NotificationCenter />
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="p-1 text-nodes-text-muted hover:text-nodes-text transition-colors"
            title="Settings (Ctrl+,)"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
