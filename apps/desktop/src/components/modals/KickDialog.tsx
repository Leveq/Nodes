import { useState } from "react";
import { X, DoorOpen } from "lucide-react";

interface KickDialogProps {
  memberName: string;
  memberKey: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void>;
}

/**
 * Confirmation dialog for kicking a member from a Node.
 * Kicked members can rejoin via invite link.
 */
export function KickDialog({
  memberName,
  open,
  onClose,
  onConfirm,
}: KickDialogProps) {
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  if (!open) return null;

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      await onConfirm(reason.trim() || undefined);
      onClose();
    } catch (error) {
      console.error("Failed to kick member:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] bg-depth-secondary border border-surface-border rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-border">
          <div className="flex items-center gap-2">
            <DoorOpen className="w-5 h-5 text-accent-warning" />
            <h2 className="text-lg font-semibold text-text-primary">
              Kick {memberName}?
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-text-muted hover:text-text-primary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-text-secondary mb-4">
            They will be removed from this Node but can rejoin with an invite link.
          </p>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-secondary">
              Reason (optional)
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Enter a reason for the kick..."
              className="w-full px-3 py-2 bg-depth-primary border border-surface-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none h-20"
              maxLength={256}
            />
            <p className="text-xs text-text-muted text-right">
              {reason.length}/256
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 p-4 border-t border-surface-border">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium bg-accent-warning text-white rounded-lg hover:bg-accent-warning/90 transition-colors disabled:opacity-50"
          >
            {isLoading ? "Kicking..." : "Kick"}
          </button>
        </div>
      </div>
    </>
  );
}
