import { useState, useCallback } from "react";
import { BUILT_IN_THEMES, type NodesTheme } from "@nodes/core";
import { useThemeStore } from "../../stores/theme-store";
import { ThemePreviewSwatch } from "./ThemePreviewSwatch";
import { ThemeCreator } from "./ThemeCreator";

// Preset accent colors
const ACCENT_PRESETS = [
  { name: "Nodes Blue", color: "#22c55e" },
  { name: "Electric Blue", color: "#3b82f6" },
  { name: "Purple", color: "#8b5cf6" },
  { name: "Pink", color: "#ec4899" },
  { name: "Orange", color: "#f97316" },
  { name: "Red", color: "#ef4444" },
  { name: "Teal", color: "#14b8a6" },
  { name: "Cyan", color: "#06b6d4" },
  { name: "Yellow", color: "#eab308" },
  { name: "Indigo", color: "#6366f1" },
  { name: "Rose", color: "#f43f5e" },
  { name: "Emerald", color: "#10b981" },
];

type FontSize = "small" | "default" | "large" | "xlarge";

const FONT_SIZES: { value: FontSize; label: string; description: string }[] = [
  { value: "small", label: "Small", description: "Compact text" },
  { value: "default", label: "Default", description: "Recommended" },
  { value: "large", label: "Large", description: "Easier to read" },
  { value: "xlarge", label: "Extra Large", description: "Accessibility" },
];

export function AppearanceSettings() {
  const {
    settings,
    allThemes,
    setActiveTheme,
    setAccentColor,
    setFontSize,
    setCompactMode,
    setRespectNodeThemes,
    addCustomTheme,
    deleteCustomTheme,
  } = useThemeStore();

  const customThemes = settings.customThemes;

  const [showCreator, setShowCreator] = useState(false);
  const [editingTheme, setEditingTheme] = useState<NodesTheme | null>(null);
  const [customAccent, setCustomAccent] = useState(settings.accentColorOverride || "");

  const handleThemeSelect = useCallback(
    (theme: NodesTheme) => {
      setActiveTheme(theme.id);
    },
    [setActiveTheme]
  );

  const handleAccentSelect = useCallback(
    (color: string) => {
      setAccentColor(color);
      setCustomAccent("");
    },
    [setAccentColor]
  );

  const handleCustomAccent = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const color = e.target.value;
      setCustomAccent(color);
      if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
        setAccentColor(color);
      }
    },
    [setAccentColor]
  );

  const handleClearAccent = useCallback(() => {
    setAccentColor(undefined);
    setCustomAccent("");
  }, [setAccentColor]);

  const handleCreateTheme = useCallback(() => {
    setEditingTheme(null);
    setShowCreator(true);
  }, []);

  const handleEditTheme = useCallback((theme: NodesTheme) => {
    setEditingTheme(theme);
    setShowCreator(true);
  }, []);

  const handleSaveTheme = useCallback(
    (theme: NodesTheme) => {
      addCustomTheme(theme);
      setShowCreator(false);
      setEditingTheme(null);
    },
    [addCustomTheme]
  );

  // Get the active theme object
  const activeTheme = allThemes.find((t) => t.id === settings.activeThemeId) || BUILT_IN_THEMES[0];

  return (
    <div className="space-y-8">
      {/* Theme Selection */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Theme</h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Choose a theme for the Nodes interface.
        </p>

        {/* Built-in Themes */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {BUILT_IN_THEMES.map((theme) => (
            <ThemePreviewSwatch
              key={theme.id}
              theme={theme}
              isActive={settings.activeThemeId === theme.id}
              onClick={() => handleThemeSelect(theme)}
            />
          ))}
        </div>

        {/* Custom Themes */}
        {customThemes.length > 0 && (
          <>
            <h3 className="text-sm font-medium text-nodes-text-muted mb-3 mt-6">
              Custom Themes
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
              {customThemes.map((theme) => (
                <ThemePreviewSwatch
                  key={theme.id}
                  theme={theme}
                  isActive={settings.activeThemeId === theme.id}
                  onClick={() => handleThemeSelect(theme)}
                  onEdit={() => handleEditTheme(theme)}
                  onDelete={() => deleteCustomTheme(theme.id)}
                  isCustom
                />
              ))}
            </div>
          </>
        )}

        {/* Create Custom Theme Button */}
        <button
          onClick={handleCreateTheme}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-nodes-border hover:border-nodes-primary hover:bg-nodes-bg-tertiary text-nodes-text-muted hover:text-nodes-text transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create Custom Theme
        </button>
      </section>

      {/* Accent Color */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Accent Color</h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Override the theme's accent color with your favorite.
        </p>

        {/* Preset Colors */}
        <div className="flex flex-wrap gap-2 mb-4">
          {ACCENT_PRESETS.map((preset) => (
            <button
              key={preset.color}
              onClick={() => handleAccentSelect(preset.color)}
              className={`w-8 h-8 rounded-full border-2 transition-all ${
                settings.accentColorOverride === preset.color
                  ? "border-white scale-110"
                  : "border-transparent hover:scale-105"
              }`}
              style={{ backgroundColor: preset.color }}
              title={preset.name}
            />
          ))}
        </div>

        {/* Custom Color Input */}
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={customAccent}
            onChange={handleCustomAccent}
            placeholder="#RRGGBB"
            className="w-28 px-3 py-2 rounded-lg bg-nodes-bg-secondary border border-nodes-border text-nodes-text text-sm focus:outline-none focus:border-nodes-primary"
            maxLength={7}
          />
          <input
            type="color"
            value={settings.accentColorOverride || activeTheme.colors.accent}
            onChange={(e) => setAccentColor(e.target.value)}
            className="w-10 h-10 rounded-lg cursor-pointer border border-nodes-border"
          />
          {settings.accentColorOverride && (
            <button
              onClick={handleClearAccent}
              className="px-3 py-2 text-sm text-nodes-text-muted hover:text-nodes-text transition-colors"
            >
              Reset to Default
            </button>
          )}
        </div>
      </section>

      {/* Font Size */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Font Size</h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Adjust the base text size across the application.
        </p>

        <div className="flex gap-3">
          {FONT_SIZES.map((size) => (
            <button
              key={size.value}
              onClick={() => setFontSize(size.value)}
              className={`flex-1 max-w-xs px-4 py-3 rounded-lg border-2 transition-colors ${
                settings.fontSize === size.value
                  ? "border-nodes-primary bg-nodes-primary/10 text-nodes-text"
                  : "border-nodes-border bg-nodes-bg hover:border-nodes-primary/50 text-nodes-text-muted hover:text-nodes-text"
              }`}
            >
              <div className="font-medium mb-1">{size.label}</div>
              <div className="text-xs opacity-70">{size.description}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Message Display */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Message Display</h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Choose how messages appear in channels and DMs.
        </p>

        <div className="flex gap-3">
          <button
            onClick={() => setCompactMode(false)}
            className={`flex-1 max-w-xs px-4 py-3 rounded-lg border-2 transition-colors ${
              !settings.compactMode
                ? "border-nodes-primary bg-nodes-primary/10 text-nodes-text"
                : "border-nodes-border bg-nodes-bg hover:border-nodes-primary/50 text-nodes-text-muted hover:text-nodes-text"
            }`}
          >
            <div className="font-medium mb-1">Comfortable</div>
            <div className="text-xs opacity-70">Standard spacing</div>
          </button>
          <button
            onClick={() => setCompactMode(true)}
            className={`flex-1 max-w-xs px-4 py-3 rounded-lg border-2 transition-colors ${
              settings.compactMode
                ? "border-nodes-primary bg-nodes-primary/10 text-nodes-text"
                : "border-nodes-border bg-nodes-bg hover:border-nodes-primary/50 text-nodes-text-muted hover:text-nodes-text"
            }`}
          >
            <div className="font-medium mb-1">Compact</div>
            <div className="text-xs opacity-70">Reduced spacing</div>
          </button>
        </div>
      </section>

      {/* Node Themes */}
      <section>
        <h2 className="text-lg font-semibold text-nodes-text mb-3">Node Themes</h2>
        <p className="text-sm text-nodes-text-muted mb-4">
          Some Nodes have custom themes set by their owners.
        </p>

        <label className="flex items-center gap-3 cursor-pointer">
          <div
            className={`relative w-11 h-6 rounded-full transition-colors ${
              settings.respectNodeThemes
                ? "bg-nodes-primary"
                : "bg-nodes-bg-tertiary"
            }`}
            onClick={() => setRespectNodeThemes(!settings.respectNodeThemes)}
          >
            <div
              className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                settings.respectNodeThemes ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </div>
          <div>
            <div className="text-sm font-medium text-nodes-text">
              Respect Node Themes
            </div>
            <div className="text-xs text-nodes-text-muted">
              When enabled, Node themes will override your personal theme while viewing that Node
            </div>
          </div>
        </label>
      </section>

      {/* Theme Creator Modal */}
      {showCreator && (
        <ThemeCreator
          baseTheme={editingTheme || activeTheme}
          onSave={handleSaveTheme}
          onClose={() => {
            setShowCreator(false);
            setEditingTheme(null);
          }}
        />
      )}
    </div>
  );
}
