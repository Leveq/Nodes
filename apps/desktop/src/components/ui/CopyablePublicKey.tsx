import { useState } from "react";
import { useToastStore } from "../../stores/toast-store";

interface Props {
  publicKey: string;
}

export function CopyablePublicKey({ publicKey }: Props) {
  const [copied, setCopied] = useState(false);
  const addToast = useToastStore((s) => s.addToast);

  const truncated = publicKey.length > 16
    ? `${publicKey.slice(0, 8)}...${publicKey.slice(-8)}`
    : publicKey;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      addToast("info", "Public key copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      addToast("error", "Failed to copy to clipboard.");
    }
  };

  return (
    <span className="inline-flex items-center gap-2">
      <span className="font-mono text-xs">{truncated}</span>
      <button
        onClick={handleCopy}
        className="text-xs text-nodes-text-muted hover:text-nodes-primary transition-colors"
      >
        {copied ? (
          <span className="text-nodes-accent">✓ Copied</span>
        ) : (
          "Copy"
        )}
      </button>
    </span>
  );
}
