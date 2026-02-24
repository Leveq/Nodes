import { useState } from "react";
import { Modal } from "./Modal";
import { Button, Input } from "../ui";
import { useNodeStore } from "../../stores/node-store";
import { useIdentityStore } from "../../stores/identity-store";

interface JoinNodeModalProps {
  onClose: () => void;
}

/**
 * Modal for joining a Node via invite link.
 */
export function JoinNodeModal({ onClose }: JoinNodeModalProps) {
  const { joinNode, isJoiningNode } = useNodeStore();
  const { publicKey } = useIdentityStore();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!inviteCode.trim()) {
      setError("Please enter an invite code.");
      return;
    }

    if (!publicKey) {
      setError("You must be logged in to join a Node.");
      return;
    }

    try {
      await joinNode(inviteCode.trim(), publicKey);
      onClose();
    } catch {
      // Error is handled by the store via toast
    }
  };

  return (
    <Modal title="Join a Node" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Input
            label="Invite Code"
            value={inviteCode}
            onChange={setInviteCode}
            placeholder="node-abc123/XyZ789..."
            autoFocus
          />
          <p className="text-xs text-nodes-text-muted mt-2">
            Paste the invite code you received from a Node member.
          </p>
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isJoiningNode}>
            {isJoiningNode ? "Joining..." : "Join Node"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
