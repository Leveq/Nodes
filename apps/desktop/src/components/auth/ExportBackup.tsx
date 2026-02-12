import { useState } from "react";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import { Button, Input } from "../ui";
import { PassphraseStrength } from "../ui/PassphraseStrength";

interface Props {
  onClose: () => void;
}

export function ExportBackup({ onClose }: Props) {
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [label, setLabel] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isExporting, setIsExporting] = useState(false);

  const { exportBackup } = useIdentityStore();
  const addToast = useToastStore((s) => s.addToast);

  const handleExport = async () => {
    const newErrors: Record<string, string> = {};

    if (passphrase !== confirmPassphrase) {
      newErrors.confirmPassphrase = "Passphrases do not match";
    }

    if (passphrase.length < 8) {
      newErrors.passphrase = "At least 8 characters required";
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    const backupLabel = label.trim() || `backup-${new Date().toISOString().split("T")[0]}`;

    setIsExporting(true);
    try {
      const backup = await exportBackup(passphrase, backupLabel);

      // Create and download the backup file
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `nodes-backup-${backupLabel}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      addToast("success", "Backup downloaded successfully.");
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      addToast("error", `Export failed: ${message}`);
    } finally {
      setIsExporting(false);
    }
  };

  // Close on backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={handleBackdropClick}
    >
      <div className="bg-nodes-surface border border-nodes-border rounded-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-semibold text-nodes-text mb-2">
          Export Identity Backup
        </h2>
        <p className="text-nodes-text-muted text-sm mb-6">
          Create an encrypted backup file. You'll need this passphrase to restore on another device.
        </p>

        <div className="space-y-4">
          <Input
            label="Backup Label (optional)"
            value={label}
            onChange={setLabel}
            placeholder="e.g., laptop-backup"
          />

          <div>
            <Input
              label="Backup Passphrase"
              type="password"
              value={passphrase}
              onChange={setPassphrase}
              placeholder="Create a strong passphrase"
              hint="This can be different from your login passphrase"
              error={errors.passphrase}
              autoFocus
            />
            <PassphraseStrength passphrase={passphrase} />
          </div>

          <Input
            label="Confirm Passphrase"
            type="password"
            value={confirmPassphrase}
            onChange={setConfirmPassphrase}
            placeholder="Confirm passphrase"
            error={errors.confirmPassphrase}
          />

          <div className="flex gap-3 pt-2">
            <Button onClick={onClose} variant="secondary" fullWidth>
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              loading={isExporting}
              disabled={!passphrase}
              fullWidth
            >
              {isExporting ? "Exporting..." : "Download Backup"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
