import { useState } from "react";
import { Modal } from "./Modal";
import { Button, Input } from "../ui";
import { useNodeStore } from "../../stores/node-store";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";

interface NodeSettingsModalProps {
  onClose: () => void;
}

/**
 * Modal for Node settings.
 * Owners can edit name/description and delete.
 * Non-owners can view info and leave.
 */
export function NodeSettingsModal({ onClose }: NodeSettingsModalProps) {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const nodes = useNodeStore((s) => s.nodes);
  const updateNode = useNodeStore((s) => s.updateNode);
  const deleteNode = useNodeStore((s) => s.deleteNode);
  const leaveNode = useNodeStore((s) => s.leaveNode);
  const generateInvite = useNodeStore((s) => s.generateInvite);
  const publicKey = useIdentityStore((s) => s.publicKey);
  const addToast = useToastStore((s) => s.addToast);

  // Compute active node instead of using method that calls get()
  const node = nodes.find((n) => n.id === activeNodeId) || null;

  const [name, setName] = useState(node?.name || "");
  const [description, setDescription] = useState(node?.description || "");
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  if (!node || !publicKey) {
    return null;
  }

  const isOwner = node.owner === publicKey;

  const handleSave = async () => {
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      await updateNode(node.id, {
        name: name.trim(),
        description: description.trim(),
      });
      onClose();
    } catch {
      // Error handled by store
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateInvite = async () => {
    try {
      const code = await generateInvite(node.id);
      setInviteCode(code);
    } catch {
      // Error handled by store
    }
  };

  const handleCopyInvite = () => {
    if (inviteCode) {
      navigator.clipboard.writeText(inviteCode);
      addToast("success", "Invite code copied to clipboard!");
    }
  };

  const handleLeave = async () => {
    try {
      await leaveNode(node.id, publicKey);
      onClose();
    } catch {
      // Error handled by store
    }
  };

  const handleDelete = async () => {
    if (deleteConfirmText !== node.name) {
      addToast("error", "Node name doesn't match.");
      return;
    }

    try {
      await deleteNode(node.id);
      onClose();
    } catch {
      // Error handled by store
    }
  };

  return (
    <Modal title={`${node.name} Settings`} onClose={onClose} width="lg">
      <div className="space-y-6">
        {/* Node info / Edit form */}
        {isOwner ? (
          <div className="space-y-4">
            <Input
              label="Node Name"
              value={name}
              onChange={setName}
              maxLength={48}
            />
            <Input
              label="Description"
              value={description}
              onChange={setDescription}
              maxLength={256}
            />
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={isSubmitting}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <div>
              <span className="text-xs text-nodes-text-muted uppercase">Name</span>
              <p className="text-nodes-text">{node.name}</p>
            </div>
            <div>
              <span className="text-xs text-nodes-text-muted uppercase">Description</span>
              <p className="text-nodes-text">{node.description || "No description"}</p>
            </div>
          </div>
        )}

        {/* Invite section */}
        <div className="pt-4 border-t border-nodes-border">
          <h3 className="text-sm font-semibold text-nodes-text mb-3">
            Invite Link
          </h3>
          {inviteCode ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-nodes-bg text-nodes-text text-sm px-3 py-2 rounded border border-nodes-border font-mono truncate">
                {inviteCode}
              </code>
              <Button variant="primary" onClick={handleCopyInvite}>
                Copy
              </Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={handleGenerateInvite}>
              Generate Invite Code
            </Button>
          )}
          <p className="text-xs text-nodes-text-muted mt-2">
            Share this code with others to let them join this Node.
          </p>
        </div>

        {/* Danger zone */}
        <div className="pt-4 border-t border-nodes-border">
          <h3 className="text-sm font-semibold text-red-400 mb-3">
            Danger Zone
          </h3>

          {isOwner ? (
            <>
              {!showDeleteConfirm ? (
                <Button
                  variant="danger"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete Node
                </Button>
              ) : (
                <div className="space-y-3 p-4 bg-red-950/20 border border-red-500/30 rounded-lg">
                  <p className="text-sm text-nodes-text">
                    This action cannot be undone. Type <strong>{node.name}</strong> to confirm.
                  </p>
                  <Input
                    value={deleteConfirmText}
                    onChange={setDeleteConfirmText}
                    placeholder="Type Node name to confirm"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setShowDeleteConfirm(false);
                        setDeleteConfirmText("");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="danger"
                      onClick={handleDelete}
                      disabled={deleteConfirmText !== node.name}
                    >
                      Delete Forever
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <Button variant="danger" onClick={handleLeave}>
              Leave Node
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
