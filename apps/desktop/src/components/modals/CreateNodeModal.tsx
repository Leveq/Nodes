import { useState } from "react";
import { Modal } from "./Modal";
import { Button, Input } from "../ui";
import { useNodeStore } from "../../stores/node-store";
import { useIdentityStore } from "../../stores/identity-store";

interface CreateNodeModalProps {
  onClose: () => void;
}

/**
 * Modal for creating a new Node (community server).
 */
export function CreateNodeModal({ onClose }: CreateNodeModalProps) {
  const { createNode, isLoading } = useNodeStore();
  const { publicKey } = useIdentityStore();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Node name is required.");
      return;
    }

    if (name.length > 48) {
      setError("Node name must be 48 characters or less.");
      return;
    }

    if (!publicKey) {
      setError("You must be logged in to create a Node.");
      return;
    }

    try {
      await createNode(name.trim(), description.trim(), icon.trim(), publicKey);
      onClose();
    } catch {
      // Error is handled by the store via toast
    }
  };

  return (
    <Modal title="Create a Node" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Node Name"
          value={name}
          onChange={setName}
          placeholder="My Awesome Community"
          maxLength={48}
          autoFocus
        />

        <Input
          label="Description (optional)"
          value={description}
          onChange={setDescription}
          placeholder="What's this Node about?"
          maxLength={256}
        />

        <Input
          label="Icon (optional)"
          value={icon}
          onChange={setIcon}
          placeholder="Single character or emoji (e.g., 🎮)"
          maxLength={2}
        />
        <p className="text-xs text-nodes-text-muted -mt-2">
          Leave empty to use the first letter of the name
        </p>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isLoading}>
            {isLoading ? "Creating..." : "Create Node"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
