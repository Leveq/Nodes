import { type InputHTMLAttributes } from "react";

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label?: string;
  error?: string;
  hint?: string;
  onChange?: (value: string) => void;
}

export function Input({
  label,
  error,
  hint,
  maxLength,
  value,
  onChange,
  className = "",
  ...props
}: InputProps) {
  const charCount = typeof value === "string" ? value.length : 0;
  const showCounter = maxLength !== undefined;

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between items-center mb-1">
          <label className="block text-nodes-text text-sm">{label}</label>
          {showCounter && (
            <span className="text-nodes-text-muted text-xs">
              {charCount}/{maxLength}
            </span>
          )}
        </div>
      )}
      <input
        value={value}
        maxLength={maxLength}
        onChange={(e) => onChange?.(e.target.value)}
        className={`
          w-full bg-nodes-surface text-nodes-text
          border rounded-lg px-4 py-3
          transition-all duration-150
          focus:outline-none focus:ring-1
          ${error 
            ? "border-nodes-danger focus:border-nodes-danger focus:ring-nodes-danger/30" 
            : "border-nodes-border focus:border-nodes-primary focus:ring-nodes-primary/30"
          }
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="text-nodes-danger text-xs mt-1">{error}</p>
      )}
      {hint && !error && (
        <p className="text-nodes-text-muted text-xs mt-1">{hint}</p>
      )}
    </div>
  );
}
