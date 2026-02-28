import { useState, useEffect } from "react";
import { Modal } from "./Modal";
import { Button, Input, Select } from "../ui";
import { useNodeStore } from "../../stores/node-store";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import { useHasPermission } from "../../hooks/usePermissions";
import { useNodeRoles } from "../../hooks/usePermissions";
import { useRoleStore } from "../../stores/role-store";
import { getModerationManager, roleManager } from "@nodes/transport-gun";
import { SLOW_MODE_OPTIONS, BUILT_IN_ROLE_IDS } from "@nodes/core";
import type { OverrideState } from "@nodes/core";
import { Clock, Trash2, Shield } from "lucide-react";

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

        {/* Channel Permissions */}
        {(canEditChannel || canManageChannels) && (
          <ChannelPermissionsSection
            channelId={channelId}
            nodeId={activeNodeId}
          />
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
// ── Channel Permissions Section ──────────────────────────────────────────────

type OverrideMap = Record<string, { viewChannel: OverrideState; sendMessages: OverrideState }>;

interface ChannelPermissionsSectionProps {
  channelId: string;
  nodeId: string;
}

function ChannelPermissionsSection({ channelId, nodeId }: ChannelPermissionsSectionProps) {
  const roles = useNodeRoles(nodeId);
  const addToast = useToastStore((s) => s.addToast);
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [isSaving, setIsSaving] = useState(false);

  // Seed local state from role-store whenever channel or roles change
  const storedOverrides = useRoleStore((s) => s.channelOverridesByNode[nodeId]?.[channelId]);

  useEffect(() => {
    const initial: OverrideMap = {};
    if (storedOverrides) {
      for (const entry of storedOverrides) {
        initial[entry.roleId] = {
          viewChannel: (entry.overrides.viewChannel as OverrideState) ?? "inherit",
          sendMessages: (entry.overrides.sendMessages as OverrideState) ?? "inherit",
        };
      }
    }
    setOverrides(initial);
  }, [storedOverrides]);

  const toggle = (roleId: string, perm: "viewChannel" | "sendMessages") => {
    setOverrides((prev) => {
      const cur = prev[roleId]?.[perm] ?? "inherit";
      const next: OverrideState = cur === "inherit" ? "deny" : cur === "deny" ? "allow" : "inherit";
      return {
        ...prev,
        [roleId]: { ...(prev[roleId] ?? { viewChannel: "inherit", sendMessages: "inherit" }), [perm]: next },
      };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await Promise.all(
        Object.entries(overrides).map(([roleId, perms]) =>
          roleManager.setChannelOverride(nodeId, channelId, roleId, {
            viewChannel: perms.viewChannel === "inherit" ? undefined : perms.viewChannel,
            sendMessages: perms.sendMessages === "inherit" ? undefined : perms.sendMessages,
          })
        )
      );
      // Refresh overrides in the role-store
      const fresh = await roleManager.getChannelOverrides(nodeId, channelId);
      useRoleStore.getState().setChannelOverrides(nodeId, channelId, fresh);
      addToast("success", "Channel permissions saved");
    } catch (err) {
      addToast("error", `Failed to save permissions: ${(err as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Only show non-owner roles in the list
  const editableRoles = roles.filter((r) => r.id !== BUILT_IN_ROLE_IDS.OWNER);
  if (editableRoles.length === 0) return null;

  return (
    <div className="pt-4 border-t border-nodes-border">
      <h3 className="text-sm font-semibold text-nodes-text mb-1 flex items-center gap-2">
        <Shield className="w-4 h-4 text-nodes-primary" />
        Channel Permissions
      </h3>
      <p className="text-xs text-nodes-text-muted mb-3">
        Override per-role permissions for this channel. Overrides take precedence over role defaults.
      </p>

      <div className="space-y-1">
        {/* Header */}
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-2 pb-1">
          <span className="text-xs font-medium text-nodes-text-muted uppercase">Role</span>
          <span className="text-xs font-medium text-nodes-text-muted uppercase w-16 text-center">View</span>
          <span className="text-xs font-medium text-nodes-text-muted uppercase w-16 text-center">Send</span>
        </div>

        {editableRoles.map((role) => {
          const perms = overrides[role.id] ?? { viewChannel: "inherit", sendMessages: "inherit" };
          return (
            <div
              key={role.id}
              className="grid grid-cols-[1fr_auto_auto] gap-2 items-center px-2 py-1.5 rounded-lg hover:bg-nodes-surface"
            >
              {/* Role name */}
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                <span className="text-sm text-nodes-text truncate">{role.name}</span>
              </div>

              {/* View Channel toggle */}
              <OverrideToggle
                state={perms.viewChannel}
                onToggle={() => toggle(role.id, "viewChannel")}
              />

              {/* Send Messages toggle */}
              <OverrideToggle
                state={perms.sendMessages}
                onToggle={() => toggle(role.id, "sendMessages")}
              />
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-nodes-text-muted">
          <span className="inline-flex items-center gap-1">
            <OverrideDot state="inherit" /> inherit
          </span>
          {" · "}
          <span className="inline-flex items-center gap-1">
            <OverrideDot state="allow" /> allow
          </span>
          {" · "}
          <span className="inline-flex items-center gap-1">
            <OverrideDot state="deny" /> deny
          </span>
        </p>
        <Button variant="primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save Permissions"}
        </Button>
      </div>
    </div>
  );
}

function OverrideDot({ state }: { state: OverrideState }) {
  return (
    <span
      className={`w-2 h-2 rounded-full inline-block ${
        state === "allow" ? "bg-green-500" : state === "deny" ? "bg-red-500" : "bg-nodes-text-muted"
      }`}
    />
  );
}

function OverrideToggle({ state, onToggle }: { state: OverrideState; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      title={state === "inherit" ? "Inherit from role (click to deny)" : state === "deny" ? "Denied (click to allow)" : "Allowed (click to inherit)"}
      className={`w-16 h-7 rounded-md text-xs font-semibold transition-colors border flex items-center justify-center gap-1 ${
        state === "allow"
          ? "bg-green-500/20 border-green-500/50 text-green-400"
          : state === "deny"
          ? "bg-red-500/20 border-red-500/50 text-red-400"
          : "bg-nodes-surface border-nodes-border text-nodes-text-muted"
      }`}
    >
      {state === "allow" ? "✓ Allow" : state === "deny" ? "✕ Deny" : "– Inherit"}
    </button>
  );
}