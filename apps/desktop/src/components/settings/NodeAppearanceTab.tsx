import { useState, useCallback } from "react";
import { BUILT_IN_THEMES, type NodesTheme } from "@nodes/core";
import { useThemeStore } from "../../stores/theme-store";
import { useNodeStore } from "../../stores/node-store";
import { Button } from "../ui";

/**
 * Node Appearance Tab - allows Node owners to set a custom theme for their Node.
 * When members enter a Node with a custom theme, it will override their personal theme
 * (if they have "respect node themes" enabled in their settings).
 */
export function NodeAppearanceTab() {
  const activeNodeId = useNodeStore((s) => s.activeNodeId);
  const nodes = useNodeStore((s) => s.nodes);
  const updateNode = useNodeStore((s) => s.updateNode);
  const { settings, allThemes } = useThemeStore();

  const node = nodes.find((n) => n.id === activeNodeId);
  const [selectedThemeId, setSelectedThemeId] = useState<string | null>(
    node?.theme?.id || null
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = useCallback(async () => {
    if (!node) return;
    
    setIsSaving(true);
    try {
      const theme = selectedThemeId 
        ? allThemes.find((t) => t.id === selectedThemeId) || null
        : null;
      
      await updateNode(node.id, { theme });
    } finally {
      setIsSaving(false);
    }
  }, [node, selectedThemeId, allThemes, updateNode]);

  const handleClear = useCallback(async () => {
    if (!node) return;
    
    setIsSaving(true);
    try {
      await updateNode(node.id, { theme: null });
      setSelectedThemeId(null);
    } finally {
      setIsSaving(false);
    }
  }, [node, updateNode]);

  if (!node) return null;

  const hasChanges = (selectedThemeId || null) !== (node.theme?.id || null);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-semibold text-nodes-text mb-2">
          Node Theme
        </h3>
        <p className="text-sm text-nodes-text-muted mb-4">
          Set a custom theme for this Node. Members who have "Respect Node themes" 
          enabled will see this theme when viewing this Node.
        </p>

        {/* Theme Grid */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {/* No theme option */}
          <button
            onClick={() => setSelectedThemeId(null)}
            className={`p-3 rounded-lg border-2 text-left transition-all ${
              selectedThemeId === null
                ? "border-nodes-primary bg-nodes-primary/10"
                : "border-nodes-border hover:border-nodes-primary/50"
            }`}
          >
            <div className="w-full h-12 rounded bg-linear-to-r from-nodes-bg-tertiary via-nodes-bg to-nodes-bg-secondary mb-2 flex items-center justify-center">
              <span className="text-xs text-nodes-text-muted">Default</span>
            </div>
            <div className="text-sm font-medium text-nodes-text">No Theme</div>
            <div className="text-xs text-nodes-text-muted">
              Use member's personal theme
            </div>
          </button>

          {/* Built-in themes */}
          {BUILT_IN_THEMES.map((theme) => (
            <ThemeOption
              key={theme.id}
              theme={theme}
              isSelected={selectedThemeId === theme.id}
              onClick={() => setSelectedThemeId(theme.id)}
            />
          ))}

          {/* Custom themes */}
          {settings.customThemes.map((theme) => (
            <ThemeOption
              key={theme.id}
              theme={theme}
              isSelected={selectedThemeId === theme.id}
              onClick={() => setSelectedThemeId(theme.id)}
              isCustom
            />
          ))}
        </div>

        {/* Save/Clear buttons */}
        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? "Saving..." : "Save Theme"}
          </Button>
          {node.theme && (
            <Button
              variant="ghost"
              onClick={handleClear}
              disabled={isSaving}
            >
              Clear Theme
            </Button>
          )}
        </div>
      </div>

      {/* Info about how node themes work */}
      <div className="p-4 bg-nodes-bg rounded-lg border border-nodes-border">
        <h4 className="text-sm font-medium text-nodes-text mb-2">
          How Node Themes Work
        </h4>
        <ul className="text-xs text-nodes-text-muted space-y-1.5">
          <li className="flex items-start gap-2">
            <span className="text-nodes-primary mt-0.5">•</span>
            <span>
              When a member enters this Node, the Node theme will temporarily override their personal theme
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-nodes-primary mt-0.5">•</span>
            <span>
              Members can disable this in their Appearance settings by turning off "Respect Node themes"
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-nodes-primary mt-0.5">•</span>
            <span>
              The theme only affects visual appearance, not functionality
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

interface ThemeOptionProps {
  theme: NodesTheme;
  isSelected: boolean;
  onClick: () => void;
  isCustom?: boolean;
}

function ThemeOption({ theme, isSelected, onClick, isCustom }: ThemeOptionProps) {
  const { colors } = theme;

  return (
    <button
      onClick={onClick}
      className={`p-3 rounded-lg border-2 text-left transition-all ${
        isSelected
          ? "border-nodes-primary bg-nodes-primary/10"
          : "border-nodes-border hover:border-nodes-primary/50"
      }`}
    >
      {/* Mini preview */}
      <div
        className="w-full h-12 rounded mb-2 flex overflow-hidden"
        style={{ backgroundColor: colors.bgPrimary }}
      >
        {/* Sidebar */}
        <div
          className="w-4 h-full"
          style={{ backgroundColor: colors.bgSecondary }}
        />
        {/* Content */}
        <div className="flex-1 p-1 flex flex-col justify-center gap-0.5">
          <div
            className="w-3/4 h-1 rounded"
            style={{ backgroundColor: colors.textMuted }}
          />
          <div
            className="w-1/2 h-1 rounded"
            style={{ backgroundColor: colors.accent }}
          />
        </div>
      </div>
      <div className="text-sm font-medium text-nodes-text">
        {theme.name}
        {isCustom && (
          <span className="ml-1.5 text-xs text-nodes-text-muted">(Custom)</span>
        )}
      </div>
    </button>
  );
}
