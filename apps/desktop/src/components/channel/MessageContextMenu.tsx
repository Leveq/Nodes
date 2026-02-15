import { useState, useRef, useEffect } from "react";
import {
  MoreHorizontal,
  Reply,
  Edit,
  Trash2,
  Copy,
  Link,
  SmilePlus,
} from "lucide-react";

interface MessageContextMenuProps {
  messageId: string;
  isOwnMessage: boolean;
  isDeleted?: boolean;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onCopyText: () => void;
  onCopyLink: () => void;
  onAddReaction: () => void;
}

/**
 * MessageContextMenu provides quick actions for a message.
 *
 * Appears on hover at top-right of message:
 * ┌────────────────────────┐
 * │ 😀  ↩️  ✏️  🗑️  ⋮       │
 * └────────────────────────┘
 *
 * Or as a dropdown from ⋮:
 * - Reply
 * - Edit (own messages only)
 * - Delete (own messages only)
 * - Copy text
 * - Copy link to message
 * - Add reaction
 */
export function MessageContextMenu({
  isOwnMessage,
  isDeleted = false,
  onReply,
  onEdit,
  onDelete,
  onCopyText,
  onCopyLink,
  onAddReaction,
}: MessageContextMenuProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };

    if (showDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDropdown]);

  // Don't show most actions for deleted messages
  if (isDeleted) {
    return null;
  }

  const IconButton = ({
    icon: Icon,
    label,
    onClick,
  }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className="p-1.5 rounded hover:bg-nodes-border/50 text-nodes-text-muted hover:text-nodes-text transition-colors"
      title={label}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  const DropdownItem = ({
    icon: Icon,
    label,
    onClick,
    variant = "default",
  }: {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    onClick: () => void;
    variant?: "default" | "danger";
  }) => (
    <button
      type="button"
      onClick={() => {
        onClick();
        setShowDropdown(false);
      }}
      className={`flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-nodes-surface transition-colors ${
        variant === "danger"
          ? "text-red-400 hover:text-red-300"
          : "text-nodes-text"
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div className="absolute -top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-nodes-bg rounded-lg border border-nodes-border shadow-lg px-1 py-0.5">
      {/* Quick action buttons */}
      <IconButton icon={SmilePlus} label="Add reaction" onClick={onAddReaction} />
      <IconButton icon={Reply} label="Reply" onClick={onReply} />
      {isOwnMessage && (
        <IconButton icon={Edit} label="Edit message" onClick={onEdit} />
      )}

      {/* Dropdown trigger */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setShowDropdown((prev) => !prev)}
          className="p-1.5 rounded hover:bg-nodes-border/50 text-nodes-text-muted hover:text-nodes-text transition-colors"
          title="More actions"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>

        {/* Dropdown menu */}
        {showDropdown && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-nodes-bg rounded-lg border border-nodes-border shadow-xl py-1 z-50">
            <DropdownItem icon={Reply} label="Reply" onClick={onReply} />
            {isOwnMessage && (
              <DropdownItem icon={Edit} label="Edit" onClick={onEdit} />
            )}
            <DropdownItem icon={Copy} label="Copy text" onClick={onCopyText} />
            <DropdownItem icon={Link} label="Copy link" onClick={onCopyLink} />
            <DropdownItem
              icon={SmilePlus}
              label="Add reaction"
              onClick={onAddReaction}
            />
            {isOwnMessage && (
              <>
                <div className="border-t border-nodes-border my-1" />
                <DropdownItem
                  icon={Trash2}
                  label="Delete"
                  onClick={onDelete}
                  variant="danger"
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
