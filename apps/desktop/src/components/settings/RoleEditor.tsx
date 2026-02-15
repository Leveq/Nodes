import { useState, useCallback } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import type { Role, RolePermissions } from "@nodes/core";
import { DEFAULT_PERMISSIONS } from "@nodes/core";
import { roleManager } from "@nodes/transport-gun";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import { Button, Input } from "../ui";

// Preset color palette
const COLOR_PALETTE = [
  "#E74C3C", "#E91E63", "#9B59B6", "#673AB7", "#3498DB",
  "#2196F3", "#00BCD4", "#009688", "#2ECC71", "#4CAF50",
  "#8BC34A", "#CDDC39", "#F1C40F", "#FFC107", "#FF9800",
  "#FF5722", "#795548", "#9E9E9E", "#607D8B", "#1ABC9C",
];

interface RoleEditorProps {
  nodeId: string;
  role: Role | null; // null = creating new role
  onClose: () => void;
  onDeleted: () => void;
}

/**
 * RoleEditor provides a form to create or edit a role.
 * 
 * - Role name input
 * - Color picker (preset palette + custom hex)
 * - Permission toggles grouped by category
 * - Save / Cancel / Delete buttons
 */
export function RoleEditor({ nodeId, role, onClose, onDeleted }: RoleEditorProps) {
  const isCreating = role === null;
  const isBuiltIn = role?.isBuiltIn ?? false;
  const addToast = useToastStore((s) => s.addToast);
  const publicKey = useIdentityStore((s) => s.publicKey);

  // Form state
  const [name, setName] = useState(role?.name ?? "");
  const [color, setColor] = useState(role?.color ?? COLOR_PALETTE[0]);
  const [permissions, setPermissions] = useState<RolePermissions>(
    role?.permissions ?? { ...DEFAULT_PERMISSIONS.role_member }
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Permission toggle handler
  const togglePermission = useCallback((key: keyof RolePermissions) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  // Save handler
  const handleSave = async () => {
    if (!name.trim()) {
      addToast("error", "Role name is required");
      return;
    }

    if (!publicKey) {
      addToast("error", "Not authenticated");
      return;
    }

    setIsSaving(true);
    try {
      if (isCreating) {
        // Position 50 is default (between built-in roles and Member)
        await roleManager.createRole(nodeId, name.trim(), color, 50, permissions, publicKey);
        addToast("success", `Role "${name}" created`);
      } else if (role) {
        await roleManager.updateRole(nodeId, role.id, {
          name: isBuiltIn ? undefined : name.trim(), // Can't rename built-in
          color,
          permissions,
        });
        addToast("success", `Role "${name}" updated`);
      }
      onClose();
    } catch (err) {
      console.error("Failed to save role:", err);
      addToast("error", `Failed to save role: ${(err as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Delete handler
  const handleDelete = async () => {
    if (!role || isBuiltIn) return;

    try {
      await roleManager.deleteRole(nodeId, role.id);
      addToast("success", `Role "${role.name}" deleted`);
      onDeleted();
    } catch (err) {
      console.error("Failed to delete role:", err);
      addToast("error", `Failed to delete role: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-nodes-surface text-nodes-text-muted hover:text-nodes-text transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h3 className="text-sm font-semibold text-nodes-text">
          {isCreating ? "Create Role" : `Edit ${role?.name}`}
        </h3>
      </div>

      {/* Name input */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-nodes-text-muted uppercase">
          Role Name
        </label>
        <Input
          value={name}
          onChange={setName}
          placeholder="Enter role name"
          maxLength={32}
          disabled={isBuiltIn}
        />
        {isBuiltIn && (
          <p className="text-xs text-nodes-text-muted">
            Built-in role names cannot be changed
          </p>
        )}
      </div>

      {/* Color picker */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-nodes-text-muted uppercase">
          Role Color
        </label>
        <div className="flex flex-wrap gap-2">
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-7 h-7 rounded-lg transition-transform ${
                color === c ? "ring-2 ring-white ring-offset-2 ring-offset-nodes-bg scale-110" : ""
              }`}
              style={{ backgroundColor: c }}
              title={c}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <span className="text-xs text-nodes-text-muted">Custom:</span>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer"
          />
          <input
            type="text"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            placeholder="#FFFFFF"
            className="w-24 px-2 py-1 text-sm bg-nodes-surface border border-nodes-border rounded text-nodes-text"
          />
        </div>
      </div>

      {/* Permissions */}
      <div className="space-y-4">
        <label className="text-xs font-medium text-nodes-text-muted uppercase">
          Permissions
        </label>

        {/* Node Management */}
        <PermissionGroup title="Node Management">
          <PermissionToggle
            label="Manage Node"
            description="Edit Node name, description, and icon"
            checked={permissions.manageNode}
            onChange={() => togglePermission("manageNode")}
          />
          <PermissionToggle
            label="Manage Channels"
            description="Create, edit, and delete channels"
            checked={permissions.manageChannels}
            onChange={() => togglePermission("manageChannels")}
          />
          <PermissionToggle
            label="Edit Channel Settings"
            description="Edit name and topic of existing channels"
            checked={permissions.editChannelSettings}
            onChange={() => togglePermission("editChannelSettings")}
          />
        </PermissionGroup>

        {/* Role Management */}
        <PermissionGroup title="Role Management">
          <PermissionToggle
            label="Manage Roles"
            description="Create, edit, and delete roles"
            checked={permissions.manageRoles}
            onChange={() => togglePermission("manageRoles")}
          />
          <PermissionToggle
            label="Assign Roles"
            description="Assign roles to members (below their own level)"
            checked={permissions.assignRoles}
            onChange={() => togglePermission("assignRoles")}
          />
        </PermissionGroup>

        {/* Messaging */}
        <PermissionGroup title="Messaging">
          <PermissionToggle
            label="Send Messages"
            description="Send text messages in channels"
            checked={permissions.sendMessages}
            onChange={() => togglePermission("sendMessages")}
          />
          <PermissionToggle
            label="Send Files"
            description="Upload and share files"
            checked={permissions.sendFiles}
            onChange={() => togglePermission("sendFiles")}
          />
          <PermissionToggle
            label="Use Reactions"
            description="Add emoji reactions to messages"
            checked={permissions.useReactions}
            onChange={() => togglePermission("useReactions")}
          />
          <PermissionToggle
            label="Embed Links"
            description="Links show previews automatically"
            checked={permissions.embedLinks}
            onChange={() => togglePermission("embedLinks")}
          />
          <PermissionToggle
            label="Delete Any Message"
            description="Delete messages from other users"
            checked={permissions.deleteAnyMessage}
            onChange={() => togglePermission("deleteAnyMessage")}
          />
        </PermissionGroup>

        {/* Moderation */}
        <PermissionGroup title="Moderation">
          <PermissionToggle
            label="Kick Members"
            description="Remove members from the Node"
            checked={permissions.kickMembers}
            onChange={() => togglePermission("kickMembers")}
          />
          <PermissionToggle
            label="Ban Members"
            description="Permanently ban members from the Node"
            checked={permissions.banMembers}
            onChange={() => togglePermission("banMembers")}
          />
          <PermissionToggle
            label="Manage Invites"
            description="Create and revoke invite links"
            checked={permissions.manageInvites}
            onChange={() => togglePermission("manageInvites")}
          />
          <PermissionToggle
            label="View Audit Log"
            description="View history of moderation actions"
            checked={permissions.viewAuditLog}
            onChange={() => togglePermission("viewAuditLog")}
          />
        </PermissionGroup>

        {/* Voice (prep for 2.4) */}
        <PermissionGroup title="Voice (Coming Soon)">
          <PermissionToggle
            label="Connect to Voice"
            description="Join voice channels"
            checked={permissions.connectVoice}
            onChange={() => togglePermission("connectVoice")}
          />
          <PermissionToggle
            label="Mute Members"
            description="Server-mute other members in voice"
            checked={permissions.muteMembers}
            onChange={() => togglePermission("muteMembers")}
          />
          <PermissionToggle
            label="Move Members"
            description="Move members between voice channels"
            checked={permissions.moveMembers}
            onChange={() => togglePermission("moveMembers")}
          />
          <PermissionToggle
            label="Disconnect Members"
            description="Disconnect members from voice"
            checked={permissions.disconnectMembers}
            onChange={() => togglePermission("disconnectMembers")}
          />
        </PermissionGroup>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 pt-4 border-t border-nodes-border">
        <Button variant="primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : isCreating ? "Create Role" : "Save Changes"}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>

        {/* Delete button (not for built-in roles) */}
        {!isCreating && !isBuiltIn && (
          <div className="ml-auto">
            {showDeleteConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-nodes-text-muted">Delete?</span>
                <Button
                  variant="danger"
                  onClick={handleDelete}
                  className="py-1! px-2! text-sm"
                >
                  Yes
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="py-1! px-2! text-sm"
                >
                  No
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                <Trash2 size={16} />
                Delete Role
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface PermissionGroupProps {
  title: string;
  children: React.ReactNode;
}

function PermissionGroup({ title, children }: PermissionGroupProps) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-nodes-text-muted">{title}</h4>
      <div className="space-y-1 pl-2">{children}</div>
    </div>
  );
}

interface PermissionToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}

function PermissionToggle({ label, description, checked, onChange }: PermissionToggleProps) {
  return (
    <button
      onClick={onChange}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-nodes-surface/50 transition-colors text-left"
    >
      {/* Toggle switch */}
      <div
        className={`relative w-10 h-5 rounded-full transition-colors ${
          checked ? "bg-nodes-primary" : "bg-nodes-border"
        }`}
      >
        <div
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </div>

      {/* Label and description */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-nodes-text">{label}</div>
        <div className="text-xs text-nodes-text-muted truncate">{description}</div>
      </div>
    </button>
  );
}
