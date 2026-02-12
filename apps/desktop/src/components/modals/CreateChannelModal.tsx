import { useState } from "react";
import { Modal } from "./Modal";
import { Button, Input } from "../ui";
import { useNodeStore } from "../../stores/node-store";

interface CreateChannelModalProps {
  nodeId: string;
  onClose: () => void;
}

/**
 * Modal for creating a new channel within a Node.
 */
export function CreateChannelModal({ nodeId, onClose }: CreateChannelModalProps) {
  const { createChannel } = useNodeStore();
  const [name, setName] = useState("");
  const [topic, setTopic] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Sanitize channel name as user types
  const sanitizeName = (input: string) => {
    return input
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .substring(0, 32);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(sanitizeName(e.target.value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Channel name is required.");
      return;
    }

    setIsSubmitting(true);

    try {
      await createChannel(nodeId, name.trim(), topic.trim());
      onClose();
    } catch {
      // Error handled by store via toast
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal title="Create Channel" onClose={onClose} width="sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-nodes-text mb-1">
            Channel Name
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-nodes-text-muted">
              #
            </span>
            <input
              type="text"
              value={name}
              onChange={handleNameChange}
              placeholder="new-channel"
              className="w-full bg-nodes-bg border border-nodes-border rounded-lg px-3 py-2 pl-7 text-nodes-text placeholder-nodes-text-muted/50 focus:outline-none focus:border-nodes-accent transition-colors"
              maxLength={32}
              autoFocus
            />
          </div>
          <p className="text-xs text-nodes-text-muted mt-1">
            Only lowercase letters, numbers, and dashes allowed.
          </p>
        </div>

        <Input
          label="Topic (optional)"
          value={topic}
          onChange={setTopic}
          placeholder="What's this channel about?"
          maxLength={256}
        />

        {/* Channel type selector (voice disabled for now) */}
        <div>
          <label className="block text-sm font-medium text-nodes-text mb-2">
            Channel Type
          </label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 bg-nodes-bg rounded-lg border border-nodes-accent cursor-pointer">
              <input
                type="radio"
                name="channelType"
                value="text"
                checked
                readOnly
                className="text-nodes-accent"
              />
              <div>
                <div className="font-medium text-nodes-text"># Text</div>
                <div className="text-xs text-nodes-text-muted">
                  Send messages, images, and files
                </div>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 bg-nodes-bg rounded-lg border border-nodes-border opacity-50 cursor-not-allowed">
              <input
                type="radio"
                name="channelType"
                value="voice"
                disabled
                className="text-nodes-accent"
              />
              <div>
                <div className="font-medium text-nodes-text">🔊 Voice</div>
                <div className="text-xs text-nodes-text-muted">
                  Coming in Phase 2
                </div>
              </div>
            </label>
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={onClose} type="button">
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Channel"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
