import { useState } from "react";
import { useIdentityStore } from "../../stores/identity-store";
import { useToastStore } from "../../stores/toast-store";
import { Button, Input } from "../ui";

interface Props {
  onSwitchToCreate: () => void;
  onSwitchToImport: () => void;
}

export function Login({ onSwitchToCreate, onSwitchToImport }: Props) {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { login, isLoading } = useIdentityStore();
  const addToast = useToastStore((s) => s.addToast);

  const handleLogin = async () => {
    setError(null);

    try {
      await login(passphrase);
      addToast("success", "Welcome back.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("decrypt")) {
        setError("Wrong passphrase");
        addToast("error", "Wrong passphrase. Try again.");
      } else if (message.includes("No identity")) {
        addToast("error", "No identity found on this device.");
        setError(message);
      } else {
        setError(message);
        addToast("error", message);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="h-screen w-screen auth-bg flex items-center justify-center">
      <div className="w-full max-w-md p-8 glass-panel rounded-xl animate-modalIn stagger-children">
        <h1 className="text-3xl font-semibold text-accent-primary mb-2" style={{ fontFamily: 'var(--font-family-heading)' }}>Nodes</h1>
        <p className="text-text-muted mb-8">Welcome back</p>

        <div className="space-y-4">
          <Input
            label="Passphrase"
            type="password"
            value={passphrase}
            onChange={setPassphrase}
            onKeyDown={handleKeyDown}
            placeholder="Enter your passphrase"
            error={error ?? undefined}
            autoFocus
          />

          <Button
            onClick={handleLogin}
            loading={isLoading}
            fullWidth
            size="lg"
          >
            {isLoading ? "Unlocking..." : "Unlock"}
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
              onClick={onSwitchToImport}
              className="text-nodes-text-muted hover:text-nodes-primary transition-colors"
            >
              Import backup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
