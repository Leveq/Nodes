import { type SelectHTMLAttributes } from "react";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
}

export function Select({
  label,
  error,
  hint,
  options,
  value,
  onChange,
  className = "",
  ...props
}: SelectProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-nodes-text text-sm mb-1">{label}</label>
      )}
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className={`
          w-full bg-nodes-surface text-nodes-text
          border rounded-lg px-4 py-3
          transition-all duration-150
          focus:outline-none focus:ring-1
          appearance-none
          cursor-pointer
          ${error 
            ? "border-nodes-danger focus:border-nodes-danger focus:ring-nodes-danger/30" 
            : "border-nodes-border focus:border-nodes-primary focus:ring-nodes-primary/30"
          }
          ${className}
        `}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
          backgroundPosition: "right 0.5rem center",
          backgroundRepeat: "no-repeat",
          backgroundSize: "1.5em 1.5em",
          paddingRight: "2.5rem",
        }}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint && !error && (
        <p className="text-nodes-text-muted text-xs mt-1">{hint}</p>
      )}
      {error && (
        <p className="text-nodes-danger text-xs mt-1">{error}</p>
      )}
    </div>
  );
}
