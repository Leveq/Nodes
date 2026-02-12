import { useState } from "react";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import { Button, Input } from "../ui";
import { PassphraseStrength } from "../ui/PassphraseStrength";

interface Props {
  onSwitchToLogin: () => void;
  onSwitchToImport: () => void;
}

export function CreateIdentity({ onSwitchToLogin, onSwitchToImport }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [accountType, setAccountType] = useState<"public" | "private">("public");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { createIdentity, isLoading } = useIdentityStore();
  const addToast = useToastStore((s) => s.addToast);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!displayName.trim()) {
      newErrors.displayName = "Display name is required";
    }

    if (passphrase.length < 8) {
      newErrors.passphrase = "At least 8 characters required";
    }

    if (passphrase !== confirmPassphrase) {
      newErrors.confirmPassphrase = "Passphrases do not match";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreate = async () => {
    if (!validate()) return;

    try {
      await createIdentity(displayName.trim(), passphrase, accountType);
      addToast("success", "Identity created. Welcome to Nodes.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      addToast("error", `Failed to create identity: ${message}`);
    }
  };

  return (
    <div className="h-screen w-screen auth-bg flex items-center justify-center">
      <div className="w-full max-w-md p-8 glass-panel rounded-xl animate-modalIn stagger-children">
        <h1 className="text-3xl font-semibold text-accent-primary mb-2" style={{ fontFamily: 'var(--font-family-heading)' }}>Nodes</h1>
        <p className="text-text-muted mb-8">Create your identity</p>

        <div className="space-y-4">
          <Input
            label="Display Name"
            value={displayName}
            onChange={setDisplayName}
            placeholder="How others will see you"
            maxLength={32}
            error={errors.displayName}
            autoFocus
          />

          <div>
            <Input
              label="Passphrase"
              type="password"
              value={passphrase}
              onChange={setPassphrase}
              placeholder="Encrypts your keypair locally"
              error={errors.passphrase}
            />
            <PassphraseStrength passphrase={passphrase} />
          </div>

          <Input
            label="Confirm Passphrase"
            type="password"
            value={confirmPassphrase}
            onChange={setConfirmPassphrase}
            placeholder="Confirm your passphrase"
            error={errors.confirmPassphrase}
          />

          <div>
            <label className="block text-nodes-text text-sm mb-3">
              Account Type
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setAccountType("public")}
                className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  accountType === "public"
                    ? "bg-nodes-primary text-white border-nodes-primary"
                    : "bg-nodes-surface text-nodes-text-muted border-nodes-border hover:border-nodes-primary"
                }`}
              >
                Public
              </button>
              <button
                type="button"
                onClick={() => setAccountType("private")}
                className={`flex-1 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  accountType === "private"
                    ? "bg-nodes-primary text-white border-nodes-primary"
                    : "bg-nodes-surface text-nodes-text-muted border-nodes-border hover:border-nodes-primary"
                }`}
              >
                Private
              </button>
            </div>
            <p className="text-nodes-text-muted text-xs mt-2">
              {accountType === "public"
                ? "Anyone can view your profile. You control individual field visibility."
                : "Profile encrypted by default. Others must request access to see your details."}
            </p>
          </div>

          <Button
            onClick={handleCreate}
            loading={isLoading}
            fullWidth
            size="lg"
          >
            {isLoading ? "Creating Identity..." : "Create Identity"}
          </Button>

          <div className="flex justify-between text-sm">
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="text-nodes-text-muted hover:text-nodes-primary transition-colors"
            >
              Already have an identity? Log in
            </button>
            <button
              type="button"
              onClick={onSwitchToImport}
              className="text-nodes-text-muted hover:text-nodes-primary transition-colors"
            >
              Import backup
            </button>
          </div>
        </div>

        <p className="text-nodes-text-muted text-xs mt-8 text-center opacity-50">
          Your identity is a cryptographic keypair stored only on this device.
          No servers. No accounts. Just math.
        </p>
      </div>
    </div>
  );
}
