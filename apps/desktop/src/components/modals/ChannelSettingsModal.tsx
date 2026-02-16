import { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { Button, Input, Select } from "../ui";
import { useNodeStore } from "../../stores/node-store";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import { useHasPermission } from "../../hooks/usePermissions";
import { getModerationManager } from "@nodes/transport-gun";
import { SLOW_MODE_OPTIONS } from "@nodes/core";
import { Clock, Trash2 } from "lucide-react";

interface ChannelSettingsModalProps {
  channelId: string;
  onClose: () => void;
}

/**
 * Modal for editing channel settings.
 * Includes name, topic, slow mode, and delete option.
 */
export function ChannelSettingsModal({ channelId, onClose }: ChannelSettingsModalProps) {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const channels = useNodeStore((s) => s.channels);
  const updateChannel = useNodeStore((s) => s.updateChannel);
  const deleteChannel = useNodeStore((s) => s.deleteChannel);
  const setActiveChannel = useNodeStore((s) => s.setActiveChannel);
  const addToast = useToastStore((s) => s.addToast);
  
  // Identity for actor info
  const publicKey = useIdentityStore((s) => s.publicKey);
  const profile = useIdentityStore((s) => s.profile);
  const actorName = profile?.data.displayName || publicKey?.slice(0, 8) || "Unknown";
  
  const canEditChannel = useHasPermission("editChannelSettings");
  const canManageChannels = useHasPermission("manageChannels");

  // Get channel data
  const nodeChannels = activeNodeId ? channels[activeNodeId] || [] : [];
  const channel = nodeChannels.find((c) => c.id === channelId);

  const [name, setName] = useState(channel?.name || "");
  const [topic, setTopic] = useState(channel?.topic || "");
  const [slowMode, setSlowMode] = useState<number>(channel?.slowMode || 0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Update local state if channel changes
  useEffect(() => {
    if (channel) {
      setName(channel.name);
      setTopic(channel.topic || "");
      setSlowMode(channel.slowMode || 0);
    }
  }, [channel]);

  if (!channel || !activeNodeId || !publicKey) {
    return null;
  }

  const handleSave = async () => {
    if (!name.trim()) {
      addToast("error", "Channel name is required");
      return;
    }

    setIsSubmitting(true);
    try {
      // Update channel info including slow mode (updates local store + Gun)
      await updateChannel(activeNodeId, channelId, {
        name: name.trim(),
        topic: topic.trim(),
        slowMode: slowMode,
      });

      // Log slow mode change to audit log (only if it changed)
      if (slowMode !== (channel.slowMode || 0)) {
        const manager = getModerationManager();
        await manager.setSlowMode(
          activeNodeId, 
          channelId, 
          slowMode, 
          publicKey, 
          actorName, 
          channel.name
        );
      }

      addToast("success", "Channel settings saved");
      onClose();
    } catch (error) {
      console.error("[ChannelSettings] Failed to save:", error);
      addToast("error", "Failed to save channel settings");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      // If this is the active channel, switch to another one
      const otherChannels = nodeChannels.filter((c) => c.id !== channelId && c.type === "text");
      if (otherChannels.length > 0) {
        setActiveChannel(otherChannels[0].id);
      }

      await deleteChannel(activeNodeId, channelId);
      addToast("success", `#${channel.name} deleted`);
      onClose();
    } catch (error) {
      console.error("[ChannelSettings] Failed to delete:", error);
      addToast("error", "Failed to delete channel");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Convert SLOW_MODE_OPTIONS to Select format
  const slowModeOptions = SLOW_MODE_OPTIONS.map((opt) => ({
    value: String(opt.value),
    label: opt.label,
  }));

  return (
    <Modal title={`Channel Settings - #${channel.name}`} onClose={onClose}>
      <div className="space-y-6">
        {/* Basic info */}
        <div className="space-y-4">
          <Input
            label="Channel Name"
            value={name}
            onChange={setName}
            maxLength={32}
            disabled={!canEditChannel}
            placeholder="general"
          />
          <Input
            label="Topic"
            value={topic}
            onChange={setTopic}
            maxLength={256}
            disabled={!canEditChannel}
            placeholder="Optional: what's this channel about?"
          />
        </div>

        {/* Slow mode section */}
        {canEditChannel && (
          <div className="pt-4 border-t border-nodes-border">
            <h3 className="text-sm font-semibold text-nodes-text mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-accent-warning" />
              Slow Mode
            </h3>
            <p className="text-xs text-nodes-text-muted mb-3">
              Limits how often members can send messages in this channel. 
              Moderators are exempt.
            </p>
            <Select
              label=""
              value={String(slowMode)}
              onChange={(val) => setSlowMode(Number(val))}
              options={slowModeOptions}
            />
          </div>
        )}

        {/* Save button */}
        {canEditChannel && (
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        )}

        {/* Danger zone */}
        {canManageChannels && (
          <div className="pt-4 border-t border-nodes-border">
            <h3 className="text-sm font-semibold text-red-400 mb-3 flex items-center gap-2">
              <Trash2 className="w-4 h-4" />
              Danger Zone
            </h3>
            {!showDeleteConfirm ? (
              <Button
                variant="danger"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete Channel
              </Button>
            ) : (
              <div className="space-y-3 p-4 bg-red-950/20 border border-red-500/30 rounded-lg">
                <p className="text-sm text-nodes-text">
                  Are you sure you want to delete <strong>#{channel.name}</strong>?
                  This action cannot be undone.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setShowDeleteConfirm(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="danger"
                    onClick={handleDelete}
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? "Deleting..." : "Delete Forever"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
