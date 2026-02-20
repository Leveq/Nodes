import { useState, useCallback, useMemo } from "react";
import type { NodesTheme, ThemeColors } from "@nodes/core";

interface ThemeCreatorProps {
  baseTheme: NodesTheme;
  onSave: (theme: NodesTheme) => void;
  onClose: () => void;
}

// Group colors for easier editing
interface ColorGroup {
  label: string;
  colors: { key: keyof ThemeColors; label: string }[];
}

const COLOR_GROUPS: ColorGroup[] = [
  {
    label: "Backgrounds",
    colors: [
      { key: "bgPrimary", label: "Primary" },
      { key: "bgSecondary", label: "Secondary" },
      { key: "bgTertiary", label: "Tertiary" },
      { key: "bgInput", label: "Input" },
      { key: "bgHover", label: "Hover" },
    ],
  },
  {
    label: "Text",
    colors: [
      { key: "textPrimary", label: "Primary" },
      { key: "textSecondary", label: "Secondary" },
      { key: "textMuted", label: "Muted" },
    ],
  },
  {
    label: "Accent",
    colors: [
      { key: "accent", label: "Primary" },
      { key: "accentHover", label: "Hover" },
      { key: "accentMuted", label: "Muted" },
      { key: "accentText", label: "Text" },
    ],
  },
  {
    label: "Status",
    colors: [
      { key: "success", label: "Success" },
      { key: "warning", label: "Warning" },
      { key: "danger", label: "Danger" },
      { key: "dangerHover", label: "Danger Hover" },
      { key: "info", label: "Info" },
    ],
  },
  {
    label: "Misc",
    colors: [
      { key: "border", label: "Border" },
      { key: "borderStrong", label: "Border Strong" },
      { key: "mentionBg", label: "Mention BG" },
      { key: "mentionText", label: "Mention Text" },
      { key: "codeBg", label: "Code BG" },
      { key: "linkColor", label: "Link" },
    ],
  },
];

/**
 * Modal for creating/editing custom themes with color pickers and live preview.
 */
export function ThemeCreator({ baseTheme, onSave, onClose }: ThemeCreatorProps) {
  const [name, setName] = useState(baseTheme.isBuiltIn ? "" : baseTheme.name);
  const [colors, setColors] = useState<ThemeColors>({ ...baseTheme.colors });
  const [activeGroup, setActiveGroup] = useState(0);

  const isEditing = !baseTheme.isBuiltIn && baseTheme.id.startsWith("custom-");

  const handleColorChange = useCallback(
    (key: keyof ThemeColors, value: string) => {
      setColors((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleSave = useCallback(() => {
    if (!name.trim()) return;

    const theme: NodesTheme = {
      id: isEditing ? baseTheme.id : `custom-${Date.now()}`,
      name: name.trim(),
      version: 1,
      colors,
      isBuiltIn: false,
    };

    onSave(theme);
  }, [name, colors, isEditing, baseTheme.id, onSave]);

  // Generate preview styles
  const previewStyle = useMemo(
    () => ({
      "--preview-bg-primary": colors.bgPrimary,
      "--preview-bg-secondary": colors.bgSecondary,
      "--preview-bg-tertiary": colors.bgTertiary,
      "--preview-bg-input": colors.bgInput,
      "--preview-text-primary": colors.textPrimary,
      "--preview-text-secondary": colors.textSecondary,
      "--preview-text-muted": colors.textMuted,
      "--preview-accent": colors.accent,
      "--preview-border": colors.border,
    }),
    [colors]
  ) as React.CSSProperties;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-4xl max-h-[90vh] bg-nodes-bg-secondary rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-nodes-border">
          <h2 className="text-lg font-semibold text-nodes-text">
            {isEditing ? "Edit Theme" : "Create Custom Theme"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-nodes-bg-tertiary text-nodes-text-muted hover:text-nodes-text transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Color Editor */}
          <div className="w-1/2 flex flex-col border-r border-nodes-border">
            {/* Theme Name */}
            <div className="p-4 border-b border-nodes-border">
              <label className="block text-sm font-medium text-nodes-text mb-2">
                Theme Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Custom Theme"
                className="w-full px-3 py-2 rounded-lg bg-nodes-bg-secondary border border-nodes-border text-nodes-text focus:outline-none focus:border-nodes-primary"
              />
            </div>

            {/* Color Group Tabs */}
            <div className="flex border-b border-nodes-border overflow-x-auto">
              {COLOR_GROUPS.map((group, index) => (
                <button
                  key={group.label}
                  onClick={() => setActiveGroup(index)}
                  className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                    activeGroup === index
                      ? "text-nodes-primary border-b-2 border-nodes-primary"
                      : "text-nodes-text-muted hover:text-nodes-text"
                  }`}
                >
                  {group.label}
                </button>
              ))}
            </div>

            {/* Color Pickers */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {COLOR_GROUPS[activeGroup].colors.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <input
                    type="color"
                    value={colors[key] || "#000000"}
                    onChange={(e) => handleColorChange(key, e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer border border-nodes-border"
                  />
                  <div className="flex-1">
                    <label className="block text-sm text-nodes-text">{label}</label>
                    <input
                      type="text"
                      value={colors[key] || ""}
                      onChange={(e) => handleColorChange(key, e.target.value)}
                      className="w-full px-2 py-1 text-xs rounded bg-nodes-bg border border-nodes-border text-nodes-text-muted font-mono"
                      placeholder="#RRGGBB"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className="w-1/2 flex flex-col bg-nodes-bg">
            <div className="p-4 border-b border-nodes-border">
              <h3 className="text-sm font-medium text-nodes-text">Live Preview</h3>
            </div>

            {/* Preview Panel */}
            <div
              className="flex-1 p-4 overflow-hidden"
              style={previewStyle}
            >
              <div
                className="h-full rounded-lg overflow-hidden flex"
                style={{ backgroundColor: "var(--preview-bg-primary)" }}
              >
                {/* Sidebar */}
                <div
                  className="w-16 p-2 flex flex-col gap-2"
                  style={{ backgroundColor: "var(--preview-bg-tertiary)" }}
                >
                  <div
                    className="w-10 h-10 rounded-lg"
                    style={{ backgroundColor: "var(--preview-accent)" }}
                  />
                  <div
                    className="w-10 h-10 rounded-lg"
                    style={{ backgroundColor: "var(--preview-bg-secondary)" }}
                  />
                  <div
                    className="w-10 h-10 rounded-lg"
                    style={{ backgroundColor: "var(--preview-bg-secondary)" }}
                  />
                </div>

                {/* Channel List */}
                <div
                  className="w-40 p-3 flex flex-col gap-2"
                  style={{ backgroundColor: "var(--preview-bg-secondary)" }}
                >
                  <div
                    className="text-xs font-bold uppercase"
                    style={{ color: "var(--preview-text-muted)" }}
                  >
                    Channels
                  </div>
                  <div
                    className="px-2 py-1 rounded text-sm"
                    style={{
                      backgroundColor: "var(--preview-accent)",
                      color: "var(--preview-text-primary)",
                    }}
                  >
                    # general
                  </div>
                  <div
                    className="px-2 py-1 text-sm"
                    style={{ color: "var(--preview-text-secondary)" }}
                  >
                    # random
                  </div>
                  <div
                    className="px-2 py-1 text-sm"
                    style={{ color: "var(--preview-text-muted)" }}
                  >
                    # help
                  </div>
                </div>

                {/* Chat Area */}
                <div
                  className="flex-1 flex flex-col"
                  style={{ backgroundColor: "var(--preview-bg-primary)" }}
                >
                  {/* Messages */}
                  <div className="flex-1 p-3 space-y-3">
                    <div className="flex gap-2">
                      <div
                        className="w-8 h-8 rounded-full shrink-0"
                        style={{ backgroundColor: "var(--preview-accent)" }}
                      />
                      <div>
                        <div
                          className="text-sm font-medium"
                          style={{ color: "var(--preview-text-primary)" }}
                        >
                          User Name
                        </div>
                        <div
                          className="text-sm"
                          style={{ color: "var(--preview-text-secondary)" }}
                        >
                          Hello! This is a preview message.
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <div
                        className="w-8 h-8 rounded-full shrink-0"
                        style={{ backgroundColor: "var(--preview-bg-tertiary)" }}
                      />
                      <div>
                        <div
                          className="text-sm font-medium"
                          style={{ color: "var(--preview-text-primary)" }}
                        >
                          Another User
                        </div>
                        <div
                          className="text-sm"
                          style={{ color: "var(--preview-text-secondary)" }}
                        >
                          Nice theme colors!
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Input */}
                  <div className="p-3">
                    <div
                      className="px-3 py-2 rounded-lg text-sm"
                      style={{
                        backgroundColor: "var(--preview-bg-input)",
                        color: "var(--preview-text-muted)",
                        border: `1px solid var(--preview-border)`,
                      }}
                    >
                      Message #general
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-nodes-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-nodes-text-muted hover:text-nodes-text hover:bg-nodes-bg-tertiary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-2 rounded-lg bg-nodes-primary text-white font-medium hover:bg-nodes-primary-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isEditing ? "Save Changes" : "Create Theme"}
          </button>
        </div>
      </div>
    </div>
  );
}
