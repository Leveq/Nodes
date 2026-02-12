import { useState } from "react";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import { Input } from "../ui";

/**
 * Account settings section: public key, change passphrase, export backup, danger zone.
 */
export function AccountSettings() {
  const publicKey = useIdentityStore((s) => s.publicKey);
  const changePassphrase = useIdentityStore((s) => s.changePassphrase);
  const exportBackup = useIdentityStore((s) => s.exportBackup);
  const deleteIdentity = useIdentityStore((s) => s.deleteIdentity);
  const addToast = useToastStore((s) => s.addToast);

  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [isChanging, setIsChanging] = useState(false);

  const [exportPass, setExportPass] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCopyKey = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey);
      addToast("success", "Public key copied to clipboard");
    }
  };

  const handleChangePassphrase = async () => {
    if (!currentPass || !newPass || !confirmPass) {
      addToast("error", "All fields are required");
      return;
    }
    if (newPass !== confirmPass) {
      addToast("error", "New passphrases don't match");
      return;
    }
    if (newPass.length < 8) {
      addToast("error", "New passphrase must be at least 8 characters");
      return;
    }

    setIsChanging(true);
    try {
      await changePassphrase(currentPass, newPass);
      addToast("success", "Passphrase updated successfully");
      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to change passphrase";
      addToast("error", message);
    } finally {
      setIsChanging(false);
    }
  };

  const handleExportBackup = async () => {
    if (!exportPass || exportPass.length < 8) {
      addToast("error", "Enter a passphrase (minimum 8 characters) to encrypt the backup");
      return;
    }

    setIsExporting(true);
    try {
      const backup = await exportBackup(exportPass, "Nodes Backup");
      const json = JSON.stringify(backup, null, 2);
      
      // Create download
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const truncatedKey = publicKey?.slice(0, 8) || "unknown";
      const date = new Date().toISOString().split("T")[0];
      a.href = url;
      a.download = `nodes-backup-${truncatedKey}-${date}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      addToast("success", "Backup exported successfully");
      setExportPass("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to export backup";
      addToast("error", message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteIdentity = async () => {
    if (deleteConfirm !== "DELETE") {
      addToast("error", "Type DELETE to confirm");
      return;
    }

    setIsDeleting(true);
    try {
      await deleteIdentity();
      addToast("success", "Identity deleted. You can restore from a backup.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete identity";
      addToast("error", message);
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Public Key */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Public Key</h2>
        <p className="text-sm text-nodes-text-muted mb-3">
          Your unique identifier on the Nodes network. Share this with others so they can find you.
        </p>
        <div className="flex gap-2">
          <div className="flex-1 px-3 py-2 bg-nodes-bg border border-nodes-border rounded-lg text-nodes-text font-mono text-sm truncate">
            {publicKey || "Not loaded"}
          </div>
          <button
            onClick={handleCopyKey}
            className="px-4 py-2 bg-nodes-bg border border-nodes-border rounded-lg text-nodes-text hover:bg-nodes-surface transition-colors"
          >
            Copy
          </button>
        </div>
      </section>

      {/* Change Passphrase */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Change Passphrase</h2>
        <p className="text-sm text-nodes-text-muted mb-3">
          Your passphrase encrypts your identity on this device. It's never sent anywhere.
        </p>
        <div className="space-y-3 max-w-md">
          <Input
            type="password"
            label="Current Passphrase"
            value={currentPass}
            onChange={(value) => setCurrentPass(value)}
            placeholder="Enter current passphrase"
          />
          <Input
            type="password"
            label="New Passphrase"
            value={newPass}
            onChange={(value) => setNewPass(value)}
            placeholder="Enter new passphrase (min 8 characters)"
          />
          <Input
            type="password"
            label="Confirm New Passphrase"
            value={confirmPass}
            onChange={(value) => setConfirmPass(value)}
            placeholder="Confirm new passphrase"
          />
          <button
            onClick={handleChangePassphrase}
            disabled={isChanging}
            className="px-4 py-2 bg-nodes-primary hover:bg-nodes-primary/90 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            {isChanging ? "Updating..." : "Update Passphrase"}
          </button>
        </div>
      </section>

      {/* Export Backup */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Export Keypair Backup</h2>
        <p className="text-sm text-nodes-text-muted mb-3">
          Save your identity to a file so you can restore it on another device. The backup is encrypted with the passphrase you provide.
        </p>
        <div className="space-y-3 max-w-md">
          <Input
            type="password"
            label="Backup Passphrase"
            value={exportPass}
            onChange={(value) => setExportPass(value)}
            placeholder="Passphrase to encrypt backup (min 8 characters)"
          />
          <button
            onClick={handleExportBackup}
            disabled={isExporting}
            className="px-4 py-2 bg-nodes-primary hover:bg-nodes-primary/90 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
          >
            {isExporting ? "Exporting..." : "Export Backup"}
          </button>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="border-t border-nodes-border pt-8">
        <h2 className="text-lg font-semibold text-red-400 mb-3">Danger Zone</h2>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <h3 className="font-medium text-nodes-text mb-2">Delete Identity</h3>
          <p className="text-sm text-nodes-text-muted mb-3">
            This clears your local keystore. Your identity still exists in the network — restore it from a backup at any time. Without a backup, your identity is lost permanently.
          </p>
          <div className="space-y-3 max-w-md">
            <Input
              label="Type DELETE to confirm"
              value={deleteConfirm}
              onChange={(value) => setDeleteConfirm(value)}
              placeholder="DELETE"
            />
            <button
              onClick={handleDeleteIdentity}
              disabled={isDeleting || deleteConfirm !== "DELETE"}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
            >
              {isDeleting ? "Deleting..." : "Delete Local Identity"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
