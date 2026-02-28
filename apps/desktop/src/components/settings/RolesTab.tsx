import { useState, useMemo, useEffect } from "react";
import { Lock, Plus, GripVertical, ChevronRight } from "lucide-react";
import { useNodeRoles, usePermissions, useIsOwner } from "../../hooks/usePermissions";
import { useNodeStore } from "../../stores/node-store";
import type { Role } from "@nodes/core";
import { BUILT_IN_ROLE_IDS } from "@nodes/core";
import { RoleEditor } from "./RoleEditor";

/**
 * RolesTab displays the role list for a Node with create/edit functionality.
 * 
 * - Lists all roles in hierarchy order (top = highest rank)
 * - Built-in roles show a lock icon
 * - Custom roles show a drag handle (reordering is future enhancement)
 * - Click a role to open the editor
 * - "Create Role" button at the bottom
 */
export function RolesTab() {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const nodes = useNodeStore((s) => s.nodes);
  const updateNode = useNodeStore((s) => s.updateNode);
  const roles = useNodeRoles();
  const { canManageRoles } = usePermissions();
  const isOwner = useIsOwner();

  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSavingDefault, setIsSavingDefault] = useState(false);

  const node = nodes.find((n) => n.id === activeNodeId);

  // Current default role: what's saved on the node (fallback to member)
  const savedDefaultRoleId = node?.defaultRoleId ?? BUILT_IN_ROLE_IDS.MEMBER;
  const [pendingDefaultRoleId, setPendingDefaultRoleId] = useState<string>(savedDefaultRoleId);

  // Roles available as join defaults (exclude owner)
  const assignableRoles = useMemo(
    () => roles.filter((r) => r.id !== BUILT_IN_ROLE_IDS.OWNER),
    [roles]
  );

  const handleSaveDefaultRole = async () => {
    if (!activeNodeId || pendingDefaultRoleId === savedDefaultRoleId) return;
    setIsSavingDefault(true);
    try {
      await updateNode(activeNodeId, { defaultRoleId: pendingDefaultRoleId });
    } finally {
      setIsSavingDefault(false);
    }
  };

  // Keep dropdown in sync if the saved value changes externally
  useEffect(() => {
    setPendingDefaultRoleId(savedDefaultRoleId);
  }, [savedDefaultRoleId]);

  // Sort roles by position
  const sortedRoles = useMemo(() => {
    return [...roles].sort((a, b) => a.position - b.position);
  }, [roles]);

  const selectedRole = useMemo(() => {
    if (!selectedRoleId) return null;
    return sortedRoles.find((r) => r.id === selectedRoleId) ?? null;
  }, [selectedRoleId, sortedRoles]);

  // Clear selection when role is deleted
  const handleRoleDeleted = () => {
    setSelectedRoleId(null);
  };

  const handleCloseEditor = () => {
    setSelectedRoleId(null);
    setIsCreating(false);
  };

  if (!activeNodeId) {
    return (
      <div className="p-4 text-nodes-text-muted text-center">
        No Node selected
      </div>
    );
  }

  // Show role editor if creating or editing
  if (isCreating || selectedRole) {
    return (
      <RoleEditor
        nodeId={activeNodeId}
        role={selectedRole}
        onClose={handleCloseEditor}
        onDeleted={handleRoleDeleted}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Default Join Role */}
      {(canManageRoles || isOwner) && (
        <div className="p-3 bg-nodes-surface rounded-lg border border-nodes-border space-y-2">
          <div>
            <h4 className="text-sm font-semibold text-nodes-text">Default Join Role</h4>
            <p className="text-xs text-nodes-text-muted">
              Role automatically assigned to new members when they join this Node.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={pendingDefaultRoleId}
              onChange={(e) => setPendingDefaultRoleId(e.target.value)}
              className="flex-1 px-3 py-1.5 text-sm bg-nodes-bg border border-nodes-border rounded-lg text-nodes-text focus:outline-none focus:border-nodes-primary"
            >
              {assignableRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
            <button
              onClick={handleSaveDefaultRole}
              disabled={isSavingDefault || pendingDefaultRoleId === savedDefaultRoleId}
              className="px-3 py-1.5 text-sm bg-nodes-primary text-white rounded-lg hover:bg-nodes-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingDefault ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-nodes-text">Roles</h3>
          <p className="text-xs text-nodes-text-muted">
            Roles define permissions for members
          </p>
        </div>
        {(canManageRoles || isOwner) && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-nodes-primary text-white rounded-lg hover:bg-nodes-primary/80 transition-colors"
          >
            <Plus size={16} />
            Create Role
          </button>
        )}
      </div>

      {/* Role list */}
      <div className="space-y-1">
        {sortedRoles.length === 0 ? (
          <p className="text-nodes-text-muted text-sm py-4 text-center">
            No roles configured. Create one to get started.
          </p>
        ) : (
          sortedRoles.map((role) => (
            <RoleListItem
              key={role.id}
              role={role}
              isSelected={selectedRoleId === role.id}
              canEdit={canManageRoles || isOwner}
              onClick={() => setSelectedRoleId(role.id)}
            />
          ))
        )}
      </div>

      {/* Explanation */}
      <div className="pt-4 border-t border-nodes-border">
        <p className="text-xs text-nodes-text-muted">
          Members can have multiple roles. Permissions are combined from all
          assigned roles. Roles higher in the list have more authority and
          can manage roles below them.
        </p>
      </div>
    </div>
  );
}

interface RoleListItemProps {
  role: Role;
  isSelected: boolean;
  canEdit: boolean;
  onClick: () => void;
}

function RoleListItem({ role, isSelected, canEdit, onClick }: RoleListItemProps) {
  const isBuiltIn = role.isBuiltIn;
  const memberCount = useRoleMemberCount(role.id);

  return (
    <button
      onClick={canEdit ? onClick : undefined}
      disabled={!canEdit}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors
        ${isSelected ? "bg-nodes-primary/20 border border-nodes-primary/50" : "bg-nodes-surface hover:bg-nodes-surface/80 border border-transparent"}
        ${!canEdit ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
      `}
    >
      {/* Drag handle / Lock icon */}
      <div className="w-5 flex justify-center text-nodes-text-muted" title={isBuiltIn ? "Built-in role" : "Drag to reorder"}>
        {isBuiltIn ? (
          <Lock size={14} />
        ) : (
          <GripVertical size={14} />
        )}
      </div>

      {/* Role color indicator */}
      <div
        className="w-3 h-3 rounded-full shrink-0"
        style={{ backgroundColor: role.color }}
      />

      {/* Role name and info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-nodes-text truncate">
            {role.name}
          </span>
          {isBuiltIn && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-nodes-border text-nodes-text-muted uppercase">
              Built-in
            </span>
          )}
        </div>
        <span className="text-xs text-nodes-text-muted">
          {memberCount === 0
            ? "No members"
            : memberCount === 1
            ? "1 member"
            : `${memberCount} members`}
        </span>
      </div>

      {/* Arrow if editable */}
      {canEdit && (
        <ChevronRight size={16} className="text-nodes-text-muted" />
      )}
    </button>
  );
}

/**
 * Hook to count members with a specific role
 */
function useRoleMemberCount(roleId: string): number {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const members = useNodeStore((s) => s.members);

  return useMemo(() => {
    if (!activeNodeId) return 0;
    const nodeMembers = members[activeNodeId] || [];
    
    // For member role, count all members (everyone implicitly has it)
    if (roleId === BUILT_IN_ROLE_IDS.MEMBER) {
      return nodeMembers.length;
    }
    
    return nodeMembers.filter((m) => m.roles?.includes(roleId)).length;
  }, [activeNodeId, members, roleId]);
}
