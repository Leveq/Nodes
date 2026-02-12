interface Props {
  passphrase: string;
}

function getStrength(passphrase: string): {
  label: string;
  width: string;
  color: string;
} {
  const len = passphrase.length;
  
  if (len === 0) {
    return { label: "", width: "0%", color: "bg-nodes-border" };
  }
  if (len < 8) {
    return { label: "Too short", width: "20%", color: "bg-nodes-danger" };
  }
  if (len < 12) {
    return { label: "Weak", width: "40%", color: "bg-orange-500" };
  }
  if (len < 16) {
    return { label: "Fair", width: "60%", color: "bg-yellow-500" };
  }
  if (len < 24) {
    return { label: "Strong", width: "80%", color: "bg-nodes-accent" };
  }
  return { label: "Excellent", width: "100%", color: "bg-green-400" };
}

export function PassphraseStrength({ passphrase }: Props) {
  const { label, width, color } = getStrength(passphrase);

  if (!passphrase) return null;

  return (
    <div className="mt-2">
      <div className="h-1 bg-nodes-border rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${color}`}
          style={{ width }}
        />
      </div>
      <p className={`text-xs mt-1 ${
        label === "Too short" || label === "Weak" 
          ? "text-nodes-danger" 
          : label === "Fair" 
            ? "text-yellow-500" 
            : "text-nodes-accent"
      }`}>
        {label}
      </p>
    </div>
  );
}
