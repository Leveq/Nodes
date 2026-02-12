import { useState, useRef, useEffect } from "react";
import { useTransport } from "../../providers/TransportProvider";
import type { UserStatus } from "@nodes/core";

interface StatusSelectorProps {
  currentStatus: UserStatus;
  onStatusChange?: (status: UserStatus) => void;
}

const statusConfig: Record<UserStatus, { label: string; color: string; icon: string }> = {
  online: { label: "Online", color: "bg-green-500", icon: "●" },
  idle: { label: "Idle", color: "bg-yellow-500", icon: "◐" },
  dnd: { label: "Do Not Disturb", color: "bg-red-500", icon: "⊘" },
  offline: { label: "Invisible", color: "bg-gray-500 ring-1 ring-gray-400", icon: "○" },
};

/**
 * Status selector dropdown for changing user presence status.
 */
export function StatusSelector({ currentStatus, onStatusChange }: StatusSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const transport = useTransport();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleStatusChange = async (status: UserStatus) => {
    setIsOpen(false);
    
    // For "invisible", we still set status to offline from others' perspective
    const actualStatus = status === "offline" ? "offline" : status;
    
    if (transport?.presence) {
      await transport.presence.setStatus(actualStatus);
    }
    
    onStatusChange?.(status);
  };

  const current = statusConfig[currentStatus] || statusConfig.online;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Status dot button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-3 h-3 rounded-full ${current.color} hover:ring-2 hover:ring-white/30 transition-all cursor-pointer`}
        title={`Status: ${current.label}`}
      />

      {/* Dropdown menu - positioned above */}
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-2 w-48 bg-nodes-surface border border-nodes-border rounded-lg shadow-xl overflow-hidden z-50">
          {(Object.entries(statusConfig) as [UserStatus, typeof statusConfig[UserStatus]][]).map(
            ([status, config]) => (
              <button
                key={status}
                onClick={() => handleStatusChange(status)}
                className={`w-full px-3 py-2 flex items-center gap-3 hover:bg-nodes-bg transition-colors text-left ${
                  currentStatus === status ? "bg-nodes-bg" : ""
                }`}
              >
                <span className={`w-3 h-3 rounded-full ${config.color}`} />
                <span className="text-nodes-text text-sm">{config.label}</span>
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}
