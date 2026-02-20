import type { NodesTheme, ThemeColors } from "@nodes/core";

/**
 * ThemeEngine applies theme colors as CSS custom properties on :root.
 *
 * Usage:
 *   ThemeEngine.apply(theme);           // Apply a full theme
 *   ThemeEngine.setAccent("#ff00ff");   // Override just the accent
 *   ThemeEngine.setFontSize("large");   // Change font size
 *   ThemeEngine.setCompactMode(true);   // Toggle compact mode
 */
export class ThemeEngine {
  private static currentThemeId: string | null = null;

  /**
   * Apply a full theme by setting all CSS variables.
   */
  static apply(theme: NodesTheme, accentOverride?: string): void {
    const root = document.documentElement;
    const colors = { ...theme.colors };

    // Apply accent override if set
    if (accentOverride) {
      colors.accent = accentOverride;
      colors.accentHover = ThemeEngine.darken(accentOverride, 15);
      colors.accentMuted = ThemeEngine.withAlpha(accentOverride, 0.15);
    }

    // Set all CSS variables
    root.style.setProperty("--bg-primary", colors.bgPrimary);
    root.style.setProperty("--bg-secondary", colors.bgSecondary);
    root.style.setProperty("--bg-tertiary", colors.bgTertiary);
    root.style.setProperty("--bg-input", colors.bgInput);
    root.style.setProperty("--bg-hover", colors.bgHover);
    root.style.setProperty("--text-primary", colors.textPrimary);
    root.style.setProperty("--text-secondary", colors.textSecondary);
    root.style.setProperty("--text-muted", colors.textMuted);
    root.style.setProperty("--accent", colors.accent);
    root.style.setProperty("--accent-hover", colors.accentHover);
    root.style.setProperty("--accent-muted", colors.accentMuted);
    root.style.setProperty("--accent-text", colors.accentText);
    root.style.setProperty("--danger", colors.danger);
    root.style.setProperty("--danger-hover", colors.dangerHover);
    root.style.setProperty("--success", colors.success);
    root.style.setProperty("--warning", colors.warning);
    root.style.setProperty("--info", colors.info);
    root.style.setProperty("--border", colors.border);
    root.style.setProperty("--border-strong", colors.borderStrong);
    root.style.setProperty("--mention-bg", colors.mentionBg);
    root.style.setProperty("--mention-text", colors.mentionText);
    root.style.setProperty("--code-bg", colors.codeBg);
    root.style.setProperty("--link-color", colors.linkColor);

    if (colors.scrollbarTrack) {
      root.style.setProperty("--scrollbar-track", colors.scrollbarTrack);
    }
    if (colors.scrollbarThumb) {
      root.style.setProperty("--scrollbar-thumb", colors.scrollbarThumb);
      root.style.setProperty(
        "--scrollbar-thumb-hover",
        ThemeEngine.lighten(colors.scrollbarThumb, 10)
      );
    }

    ThemeEngine.currentThemeId = theme.id;

    // Store in localStorage for instant load on next startup
    localStorage.setItem("nodes_active_theme", JSON.stringify(theme));
    if (accentOverride) {
      localStorage.setItem("nodes_accent_override", accentOverride);
    } else {
      localStorage.removeItem("nodes_accent_override");
    }
  }

  /**
   * Set only the accent color (without changing the full theme).
   */
  static setAccent(color: string): void {
    const root = document.documentElement;
    root.style.setProperty("--accent", color);
    root.style.setProperty("--accent-hover", ThemeEngine.darken(color, 15));
    root.style.setProperty("--accent-muted", ThemeEngine.withAlpha(color, 0.15));
    localStorage.setItem("nodes_accent_override", color);
  }

  /**
   * Clear accent override (revert to theme default).
   */
  static clearAccentOverride(): void {
    localStorage.removeItem("nodes_accent_override");
    // The theme will need to be re-applied to restore the original accent
  }

  /**
   * Set font size.
   */
  static setFontSize(size: "small" | "default" | "large" | "xlarge"): void {
    const root = document.documentElement;
    const sizes = {
      small: "12px",
      default: "14px",
      large: "16px",
      xlarge: "18px",
    };
    root.style.setProperty("--font-size-base", sizes[size]);
    root.style.fontSize = sizes[size];
    localStorage.setItem("nodes_font_size", size);
  }

  /**
   * Set compact mode.
   */
  static setCompactMode(compact: boolean): void {
    const root = document.documentElement;
    if (compact) {
      root.style.setProperty("--message-spacing", "2px");
      root.style.setProperty("--avatar-size", "24px");
      root.style.setProperty("--padding-message", "4px 12px");
      root.classList.add("compact");
    } else {
      root.style.setProperty("--message-spacing", "8px");
      root.style.setProperty("--avatar-size", "40px");
      root.style.setProperty("--padding-message", "8px 16px");
      root.classList.remove("compact");
    }
    localStorage.setItem("nodes_compact_mode", String(compact));
  }

  /**
   * Load theme from localStorage on app startup (before Gun syncs).
   * This prevents FOUC (flash of unstyled content).
   */
  static loadFromLocalStorage(): void {
    try {
      const themeJson = localStorage.getItem("nodes_active_theme");
      const accent = localStorage.getItem("nodes_accent_override") ?? undefined;
      const fontSize = (localStorage.getItem("nodes_font_size") as "small" | "default" | "large" | "xlarge") ?? "default";
      const compact = localStorage.getItem("nodes_compact_mode") === "true";

      if (themeJson) {
        const theme = JSON.parse(themeJson) as NodesTheme;
        ThemeEngine.apply(theme, accent);
      }

      ThemeEngine.setFontSize(fontSize);
      ThemeEngine.setCompactMode(compact);
    } catch {
      // First run — defaults will be applied when theme store initializes
    }
  }

  /**
   * Get the current active theme ID.
   */
  static getCurrentThemeId(): string | null {
    return ThemeEngine.currentThemeId;
  }

  // ── Color Utilities ──

  /**
   * Darken a hex color by a percentage.
   */
  static darken(hex: string, percent: number): string {
    // Handle rgba format
    if (hex.startsWith("rgba")) {
      return hex; // Can't darken rgba easily, return as-is
    }
    
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.max(0, (num >> 16) - Math.round(255 * (percent / 100)));
    const g = Math.max(0, ((num >> 8) & 0x00ff) - Math.round(255 * (percent / 100)));
    const b = Math.max(0, (num & 0x0000ff) - Math.round(255 * (percent / 100)));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  }

  /**
   * Lighten a hex color by a percentage.
   */
  static lighten(hex: string, percent: number): string {
    if (hex.startsWith("rgba")) {
      return hex;
    }
    
    const num = parseInt(hex.replace("#", ""), 16);
    const r = Math.min(255, (num >> 16) + Math.round(255 * (percent / 100)));
    const g = Math.min(255, ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100)));
    const b = Math.min(255, (num & 0x0000ff) + Math.round(255 * (percent / 100)));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
  }

  /**
   * Convert a hex color to rgba with alpha.
   */
  static withAlpha(hex: string, alpha: number): string {
    if (hex.startsWith("rgba")) {
      return hex;
    }
    
    const num = parseInt(hex.replace("#", ""), 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  /**
   * Check if a color is light or dark (for determining text color).
   */
  static isLight(hex: string): boolean {
    if (hex.startsWith("rgba")) {
      return false; // Default to dark assumption for rgba
    }
    
    const num = parseInt(hex.replace("#", ""), 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    // Using relative luminance formula
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5;
  }

  /**
   * Generate a complete ThemeColors object from partial input.
   * Fills in missing values with sensible defaults based on provided colors.
   */
  static generateThemeColors(partial: Partial<ThemeColors>): ThemeColors {
    const bgPrimary = partial.bgPrimary ?? "#1e1e2e";
    const isLightTheme = ThemeEngine.isLight(bgPrimary);
    
    return {
      bgPrimary,
      bgSecondary: partial.bgSecondary ?? (isLightTheme ? ThemeEngine.darken(bgPrimary, 5) : ThemeEngine.lighten(bgPrimary, 5)),
      bgTertiary: partial.bgTertiary ?? (isLightTheme ? ThemeEngine.darken(bgPrimary, 10) : ThemeEngine.lighten(bgPrimary, 10)),
      bgInput: partial.bgInput ?? bgPrimary,
      bgHover: partial.bgHover ?? (isLightTheme ? ThemeEngine.darken(bgPrimary, 8) : ThemeEngine.lighten(bgPrimary, 8)),
      textPrimary: partial.textPrimary ?? (isLightTheme ? "#1a1a1a" : "#e0e0e0"),
      textSecondary: partial.textSecondary ?? (isLightTheme ? "#555555" : "#a0a0a0"),
      textMuted: partial.textMuted ?? (isLightTheme ? "#999999" : "#666666"),
      accent: partial.accent ?? "#7c3aed",
      accentHover: partial.accentHover ?? ThemeEngine.darken(partial.accent ?? "#7c3aed", 15),
      accentMuted: partial.accentMuted ?? ThemeEngine.withAlpha(partial.accent ?? "#7c3aed", 0.15),
      accentText: partial.accentText ?? "#ffffff",
      danger: partial.danger ?? "#ef4444",
      dangerHover: partial.dangerHover ?? ThemeEngine.darken(partial.danger ?? "#ef4444", 15),
      success: partial.success ?? "#22c55e",
      warning: partial.warning ?? "#f59e0b",
      info: partial.info ?? "#3b82f6",
      border: partial.border ?? (isLightTheme ? "#e0e0e0" : "#2a2a4a"),
      borderStrong: partial.borderStrong ?? (isLightTheme ? "#cccccc" : "#45475a"),
      mentionBg: partial.mentionBg ?? ThemeEngine.withAlpha(partial.accent ?? "#7c3aed", 0.3),
      mentionText: partial.mentionText ?? (isLightTheme ? partial.accent ?? "#7c3aed" : ThemeEngine.lighten(partial.accent ?? "#7c3aed", 20)),
      codeBg: partial.codeBg ?? (isLightTheme ? "#f0f0f0" : "#11111b"),
      linkColor: partial.linkColor ?? partial.info ?? "#3b82f6",
      scrollbarTrack: partial.scrollbarTrack,
      scrollbarThumb: partial.scrollbarThumb,
    };
  }
}
