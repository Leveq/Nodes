import { type ButtonHTMLAttributes, type ReactNode } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  loading?: boolean;
  variant?: ButtonVariant;
  fullWidth?: boolean;
  size?: ButtonSize;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: "bg-nodes-primary hover:bg-nodes-primary-light text-white",
  secondary: "bg-nodes-surface border border-nodes-border text-nodes-text hover:border-nodes-primary",
  danger: "bg-transparent hover:bg-nodes-danger text-nodes-text-muted hover:text-white",
  ghost: "bg-transparent text-nodes-text-muted hover:text-nodes-text",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "py-1.5 px-3 text-xs",
  md: "py-2 px-4 text-sm",
  lg: "py-3 px-6 text-base",
};

export function Button({
  children,
  loading = false,
  disabled = false,
  variant = "primary",
  fullWidth = false,
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      className={`
        font-medium rounded-lg transition-all duration-150
        active:scale-95 focus:outline-none focus:ring-2 focus:ring-nodes-primary/50
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${fullWidth ? "w-full" : ""}
        ${isDisabled ? "opacity-50 cursor-not-allowed active:scale-100" : ""}
        ${className}
      `}
      {...props}
    >
      <span className="inline-flex items-center justify-center gap-2">
        {loading && (
          <svg
            className="animate-spin h-4 w-4"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </span>
    </button>
  );
}
