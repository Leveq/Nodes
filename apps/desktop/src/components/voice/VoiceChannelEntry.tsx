import { Volume2, VolumeX, MicOff } from "lucide-react";
import { useVoiceStore } from "../../stores/voice-store";
import { useVoiceChannelParticipants } from "../../hooks/useVoiceChannelParticipants";
import { useDisplayNames } from "../../hooks/useDisplayNames";
import { Avatar } from "../ui/Avatar";
import type { VoiceParticipant } from "@nodes/core";

interface VoiceChannelEntryProps {
  channelId: string;
  channelName: string;
  isActive: boolean;
  onJoin: () => void;
}

/**
 * VoiceChannelEntry renders a voice channel in the sidebar.
 * Shows the channel name with a speaker icon and lists connected participants.
 */
export function VoiceChannelEntry({
  channelId,
  channelName,
  isActive,
  onJoin,
}: VoiceChannelEntryProps) {
  const voiceState = useVoiceStore((s) => s.state);
  const localParticipants = useVoiceStore((s) => s.participants);
  
  // Subscribe to Gun for remote participants (for showing users when not connected)
  const remoteParticipants = useVoiceChannelParticipants(channelId);
  
  const isConnected = voiceState.channelId === channelId;
  
  // Use local participants when connected (more accurate), remote when not
  const participants = isConnected ? localParticipants : remoteParticipants;
  
  const participantKeys = participants.map(p => p.publicKey);
  const { displayNames } = useDisplayNames(participantKeys);

  return (
    <div>
      {/* Channel name button */}
      <button
        onClick={onJoin}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-left hover:bg-surface-hover transition-colors ${
          isActive ? "bg-surface-hover text-text-primary" : "text-text-muted"
        } ${isConnected ? "text-accent-success" : ""}`}
      >
        <Volume2 className="w-4 h-4 shrink-0" />
        <span className="truncate flex-1">{channelName}</span>
        {isConnected && (
          <span className="w-2 h-2 bg-accent-success rounded-full" />
        )}
      </button>

      {/* Connected participants list - show participants from Gun data */}
      {participants.length > 0 && (
        <div className="ml-4 mt-1 space-y-0.5">
          {participants.map((participant) => (
            <VoiceParticipantItem
              key={participant.publicKey}
              participant={participant}
              displayName={displayNames[participant.publicKey] || participant.displayName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface VoiceParticipantItemProps {
  participant: VoiceParticipant;
  displayName: string;
}

function VoiceParticipantItem({ participant, displayName }: VoiceParticipantItemProps) {
  const { publicKey, selfMuted, deafened, speaking, serverMuted, roleColor } = participant;

  return (
    <div
      className={`flex items-center gap-2 px-2 py-1 rounded text-sm ${
        speaking ? "bg-blue-500/10" : ""
      }`}
    >
      {/* Avatar with speaking indicator - neon royal blue ring */}
      <div className={`relative ${speaking ? "ring-2 ring-blue-500 rounded-full" : ""}`}>
        <Avatar
          publicKey={publicKey}
          displayName={displayName}
          size="xs"
        />
      </div>

      {/* Name with role color */}
      <span
        className="truncate flex-1 text-text-muted"
        style={roleColor ? { color: roleColor } : undefined}
      >
        {displayName}
      </span>

      {/* Status icons */}
      <div className="flex items-center gap-0.5">
        {(selfMuted || serverMuted) && (
          <MicOff className="w-3 h-3 text-accent-error" />
        )}
        {deafened && (
          <VolumeX className="w-3 h-3 text-accent-error" />
        )}
      </div>
    </div>
  );
}
