import { useState } from "react";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import { Button, Input } from "../ui";
import { PassphraseStrength } from "../ui/PassphraseStrength";
import type { KeyBackup } from "@nodes/crypto";

interface Props {
  onSwitchToCreate: () => void;
  onSwitchToLogin: () => void;
}

export function ImportBackup({ onSwitchToCreate, onSwitchToLogin }: Props) {
  const [backupJson, setBackupJson] = useState("");
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [localPassphrase, setLocalPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { importBackup, isLoading } = useIdentityStore();
  const addToast = useToastStore((s) => s.addToast);

  const handleImport = async () => {
    const newErrors: Record<string, string> = {};

    // Validate local passphrase confirmation
    if (localPassphrase !== confirmPassphrase) {
      newErrors.confirmPassphrase = "Passphrases do not match";
    }

    if (localPassphrase.length < 8) {
      newErrors.localPassphrase = "At least 8 characters required";
    }

    // Parse backup JSON
    let backup: KeyBackup;
    try {
      backup = JSON.parse(backupJson);
      if (!backup.version || !backup.encrypted || !backup.pub) {
        throw new Error("Invalid backup format");
      }
    } catch {
      newErrors.backupJson = "Invalid backup file";
      setErrors(newErrors);
      return;
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    try {
      await importBackup(backup, backupPassphrase, localPassphrase);
      addToast("success", "Identity restored successfully.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("decrypt")) {
        addToast("error", "Wrong backup passphrase.");
        setErrors({ backupPassphrase: "Wrong passphrase" });
      } else {
        addToast("error", `Failed to restore: ${message}`);
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setBackupJson(text);
      setErrors((prev) => ({ ...prev, backupJson: "" }));
    } catch {
      setErrors((prev) => ({ ...prev, backupJson: "Failed to read file" }));
    }
  };

  return (
    <div className="h-screen w-screen bg-nodes-bg flex items-center justify-center">
      <div className="w-full max-w-md p-8">
        <h1 className="text-3xl font-bold text-nodes-primary mb-2">Nodes</h1>
        <p className="text-nodes-text-muted mb-8">Restore from backup</p>

        <div className="space-y-4">
          {/* Backup file input */}
          <div>
            <label className="block text-nodes-text text-sm mb-1">
              Backup File
            </label>
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
              id="backup-file"
            />
            <label
              htmlFor="backup-file"
              className={`block bg-nodes-surface text-nodes-text border rounded-lg px-4 py-3 cursor-pointer hover:border-nodes-primary transition-colors text-center ${
                errors.backupJson ? "border-nodes-danger" : "border-nodes-border"
              }`}
            >
              {backupJson ? (
                <span className="text-nodes-accent">✓ Backup loaded</span>
              ) : (
                "Choose file..."
              )}
            </label>
            <p className="text-nodes-text-muted text-xs mt-1">
              Or paste the backup JSON below
            </p>
          </div>

          {/* Backup JSON textarea */}
          <div>
            <textarea
              value={backupJson}
              onChange={(e) => setBackupJson(e.target.value)}
              className={`w-full bg-nodes-surface text-nodes-text border rounded-lg px-4 py-3 focus:outline-none focus:ring-1 focus:ring-nodes-primary/30 focus:border-nodes-primary h-24 resize-none font-mono text-xs transition-colors ${
                errors.backupJson ? "border-nodes-danger" : "border-nodes-border"
              }`}
              placeholder='{"version":1,"encrypted":"...","pub":"...","exportedAt":...,"label":"..."}'
            />
            {errors.backupJson && (
              <p className="text-nodes-danger text-xs mt-1">{errors.backupJson}</p>
            )}
          </div>

          <Input
            label="Backup Passphrase"
            type="password"
            value={backupPassphrase}
            onChange={setBackupPassphrase}
            placeholder="Passphrase used when creating backup"
            error={errors.backupPassphrase}
          />

          <div>
            <Input
              label="New Local Passphrase"
              type="password"
              value={localPassphrase}
              onChange={setLocalPassphrase}
              placeholder="Create a passphrase for this device"
              error={errors.localPassphrase}
            />
            <PassphraseStrength passphrase={localPassphrase} />
          </div>

          <Input
            label="Confirm Local Passphrase"
            type="password"
            value={confirmPassphrase}
            onChange={setConfirmPassphrase}
            placeholder="Confirm your new passphrase"
            error={errors.confirmPassphrase}
          />

          <Button
            onClick={handleImport}
            loading={isLoading}
            disabled={!backupJson || !backupPassphrase || !localPassphrase}
            fullWidth
            size="lg"
          >
            {isLoading ? "Restoring..." : "Restore Identity"}
          </Button>

          <div className="flex justify-between text-sm">
            <button
              type="button"
              onClick={onSwitchToCreate}
              className="text-nodes-text-muted hover:text-nodes-primary transition-colors"
            >
              Create new identity
            </button>
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-nodes-text-muted hover:text-nodes-primary transition-colors"
            >
              Back to login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
