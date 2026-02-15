import { Mic, MicOff, Volume2, VolumeX, PhoneOff } from "lucide-react";
import { useVoiceStore } from "../../stores/voice-store";
import { useNodeStore } from "../../stores/node-store";

interface VoiceConnectionBarProps {
  onMuteToggle: () => void;
  onDeafenToggle: () => void;
  onDisconnect: () => void;
}

/**
 * VoiceConnectionBar shows the current voice connection status.
 * Displays at the bottom of the sidebar when connected to a voice channel.
 */
export function VoiceConnectionBar({
  onMuteToggle,
  onDeafenToggle,
  onDisconnect,
}: VoiceConnectionBarProps) {
  const voiceState = useVoiceStore((s) => s.state);
  const participants = useVoiceStore((s) => s.participants);
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const channels = useNodeStore((s) => s.channels);

  // Don't render if not connected
  if (!voiceState.channelId) return null;

  // Find the channel name
  const nodeChannels = activeNodeId ? channels[activeNodeId] || [] : [];
  const channel = nodeChannels.find((c) => c.id === voiceState.channelId);
  const channelName = channel?.name || "Voice";

  const { muted, deafened, connecting, tier } = voiceState;

  // Connection status text
  const getStatusText = () => {
    if (connecting) return "Connecting...";
    const userCount = participants.length + 1; // +1 for self
    const tierLabel = tier === "mesh" ? "P2P" : "Server";
    return `${tierLabel} • ${userCount} user${userCount !== 1 ? "s" : ""}`;
  };

  return (
    <div className="border-t border-surface-border bg-depth-tertiary p-2">
      {/* Channel info */}
      <div className="flex items-center gap-2 mb-2">
        <Volume2 className="w-4 h-4 text-accent-success shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary truncate">
            {channelName}
          </div>
          <div className="text-xs text-text-muted">
            {getStatusText()}
          </div>
        </div>
      </div>

      {/* Control buttons */}
      <div className="flex items-center gap-1">
        {/* Mute button */}
        <button
          onClick={onMuteToggle}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
            muted
              ? "bg-accent-error/20 text-accent-error hover:bg-accent-error/30"
              : "bg-surface-hover text-text-muted hover:text-text-primary hover:bg-surface-border"
          }`}
          title={muted ? "Unmute (Ctrl+Shift+M)" : "Mute (Ctrl+Shift+M)"}
        >
          {muted ? (
            <MicOff className="w-4 h-4" />
          ) : (
            <Mic className="w-4 h-4" />
          )}
        </button>

        {/* Deafen button */}
        <button
          onClick={onDeafenToggle}
          className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded transition-colors ${
            deafened
              ? "bg-accent-error/20 text-accent-error hover:bg-accent-error/30"
              : "bg-surface-hover text-text-muted hover:text-text-primary hover:bg-surface-border"
          }`}
          title={deafened ? "Undeafen (Ctrl+Shift+D)" : "Deafen (Ctrl+Shift+D)"}
        >
          {deafened ? (
            <VolumeX className="w-4 h-4" />
          ) : (
            <Volume2 className="w-4 h-4" />
          )}
        </button>

        {/* Disconnect button */}
        <button
          onClick={onDisconnect}
          className="px-3 py-1.5 rounded bg-accent-error/20 text-accent-error hover:bg-accent-error/30 transition-colors"
          title="Disconnect"
        >
          <PhoneOff className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
