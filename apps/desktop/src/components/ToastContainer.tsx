import { useEffect, useState } from "react";
import { useToastStore, type Toast, type ToastType } from "../stores/toast-store";

const icons: Record<ToastType, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "⚠",
};

const styles: Record<ToastType, string> = {
  success: "bg-bg-float border-nodes-accent text-nodes-accent",
  error: "bg-bg-float border-nodes-danger text-nodes-danger",
  info: "bg-bg-float border-nodes-primary text-nodes-primary",
  warning: "bg-bg-float border-yellow-500 text-yellow-500",
};

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  const [progress, setProgress] = useState(100);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setIsVisible(true));

    if (toast.duration > 0) {
      const interval = 50; // Update every 50ms
      const decrement = (100 / toast.duration) * interval;
      const timer = setInterval(() => {
        setProgress((prev) => Math.max(0, prev - decrement));
      }, interval);
      return () => clearInterval(timer);
    }
  }, [toast.duration]);

  return (
    <div
      onClick={onRemove}
      className={`
        relative overflow-hidden cursor-pointer
        border rounded-lg px-4 py-3 shadow-lg
        transition-all duration-200 ease-out
        ${styles[toast.type]}
        ${isVisible ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"}
      `}
    >
      <div className="flex items-center gap-3">
        <span className="text-lg font-bold">{icons[toast.type]}</span>
        <span className="text-sm font-medium">{toast.message}</span>
      </div>
      
      {/* Progress bar */}
      {toast.duration > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-current/20">
          <div
            className="h-full bg-current transition-[width] duration-50 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onRemove={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}
