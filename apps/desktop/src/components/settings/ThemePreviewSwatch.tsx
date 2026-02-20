import type { NodesTheme } from "@nodes/core";

interface ThemePreviewSwatchProps {
  theme: NodesTheme;
  isActive: boolean;
  onClick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  isCustom?: boolean;
}

/**
 * Mini preview card for a theme in the theme selector grid.
 * Shows a compact visual representation of the theme colors.
 */
export function ThemePreviewSwatch({
  theme,
  isActive,
  onClick,
  onEdit,
  onDelete,
  isCustom,
}: ThemePreviewSwatchProps) {
  const { colors } = theme;

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        className={`w-full p-2 rounded-lg border-2 transition-all ${
          isActive
            ? "border-nodes-primary ring-2 ring-nodes-primary/30"
            : "border-nodes-border hover:border-nodes-primary/50"
        }`}
        style={{ backgroundColor: colors.bgPrimary }}
      >
        {/* Mini Preview */}
        <div
          className="rounded overflow-hidden"
          style={{ backgroundColor: colors.bgSecondary }}
        >
          {/* Header bar */}
          <div
            className="h-4 flex items-center gap-1 px-2"
            style={{ backgroundColor: colors.bgPrimary }}
          >
            <div
              className="w-6 h-1.5 rounded"
              style={{ backgroundColor: colors.accent }}
            />
          </div>

          {/* Content area */}
          <div className="p-2 space-y-1.5">
            {/* Channel name */}
            <div className="flex items-center gap-1">
              <div
                className="w-1 h-1 rounded-full"
                style={{ backgroundColor: colors.accent }}
              />
              <div
                className="h-1 w-10 rounded"
                style={{ backgroundColor: colors.textSecondary }}
              />
            </div>

            {/* Message preview */}
            <div className="flex gap-1.5">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: colors.accent }}
              />
              <div className="flex-1 space-y-0.5">
                <div
                  className="h-1 w-8 rounded"
                  style={{ backgroundColor: colors.textPrimary }}
                />
                <div
                  className="h-1 w-full rounded"
                  style={{ backgroundColor: colors.textMuted }}
                />
              </div>
            </div>

            {/* Another message */}
            <div className="flex gap-1.5">
              <div
                className="w-3 h-3 rounded-full shrink-0"
                style={{ backgroundColor: colors.bgTertiary }}
              />
              <div className="flex-1 space-y-0.5">
                <div
                  className="h-1 w-6 rounded"
                  style={{ backgroundColor: colors.textPrimary }}
                />
                <div
                  className="h-1 w-3/4 rounded"
                  style={{ backgroundColor: colors.textMuted }}
                />
              </div>
            </div>

            {/* Input bar */}
            <div
              className="h-2 rounded mt-2"
              style={{ backgroundColor: colors.bgInput }}
            />
          </div>
        </div>

        {/* Theme Name */}
        <div
          className="mt-2 text-xs font-medium truncate"
          style={{ color: colors.textPrimary }}
        >
          {theme.name}
        </div>
      </button>

      {/* Edit/Delete buttons for custom themes */}
      {isCustom && (
        <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="p-1 rounded bg-nodes-bg-secondary/80 hover:bg-nodes-bg-tertiary text-nodes-text-muted hover:text-nodes-text"
              title="Edit theme"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="p-1 rounded bg-nodes-bg-secondary/80 hover:bg-nodes-danger/20 text-nodes-text-muted hover:text-nodes-danger"
              title="Delete theme"
            >
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      )}

      {/* Active indicator */}
      {isActive && (
        <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-nodes-primary flex items-center justify-center">
          <svg
            className="w-2.5 h-2.5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </div>
  );
}
