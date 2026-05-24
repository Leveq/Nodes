import { type InputHTMLAttributes, useState, useCallback } from "react";

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
  type,
  onKeyDown,
  onKeyUp,
  ...props
}: InputProps) {
  const charCount = typeof value === "string" ? value.length : 0;
  const showCounter = maxLength !== undefined;
  const isPassword = type === "password";
  const [capsLock, setCapsLock] = useState(false);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isPassword) setCapsLock(e.getModifierState("CapsLock"));
    onKeyDown?.(e);
  }, [isPassword, onKeyDown]);

  const handleKeyUp = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isPassword) setCapsLock(e.getModifierState("CapsLock"));
    onKeyUp?.(e);
  }, [isPassword, onKeyUp]);

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
        type={type}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
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
      {isPassword && capsLock && (
        <p className="text-warning text-xs mt-1 flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 shrink-0">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          Caps Lock is on
        </p>
      )}
      {error && (
        <p className="text-nodes-danger text-xs mt-1">{error}</p>
      )}
      {hint && !error && (
        <p className="text-nodes-text-muted text-xs mt-1">{hint}</p>
      )}
    </div>
  );
}
