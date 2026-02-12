interface BadgeProps {
  variant: "public" | "private";
  size?: "sm" | "md";
}

export function Badge({ variant, size = "md" }: BadgeProps) {
  const sizeStyles = size === "sm" 
    ? "text-xs px-1.5 py-0.5" 
    : "text-xs px-2 py-1";

  if (variant === "public") {
    return (
      <span className={`inline-flex items-center gap-1 rounded bg-nodes-accent/10 text-nodes-accent ${sizeStyles}`}>
        Public
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-1 rounded bg-purple-500/10 text-purple-400 ${sizeStyles}`}>
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      Private
    </span>
  );
}
