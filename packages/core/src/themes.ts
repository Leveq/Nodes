// ── Theme Types (Milestone 3.4) ──

export interface ThemeColors {
  // Backgrounds
  bgPrimary: string;        // Main content area
  bgSecondary: string;      // Sidebar, panels
  bgTertiary: string;       // Elevated elements (modals, dropdowns)
  bgInput: string;          // Input fields
  bgHover: string;          // Hover state on items

  // Text
  textPrimary: string;      // Main text
  textSecondary: string;    // Secondary/less important text
  textMuted: string;        // Disabled, hints, timestamps

  // Accent
  accent: string;           // Primary action color
  accentHover: string;      // Hover state
  accentMuted: string;      // Subtle backgrounds (mention highlight, selection)
  accentText: string;       // Text on accent backgrounds

  // Status
  danger: string;           // Destructive actions, errors
  dangerHover: string;
  success: string;          // Online, success states
  warning: string;          // Idle, warnings
  info: string;             // Information

  // Borders & Dividers
  border: string;           // Default borders
  borderStrong: string;     // Emphasized borders

  // Specific UI
  mentionBg: string;        // @mention highlight background
  mentionText: string;      // @mention text color
  codeBg: string;           // Code block background
  linkColor: string;        // Hyperlink color

  // Scrollbar (optional)
  scrollbarTrack?: string;
  scrollbarThumb?: string;
}

export interface NodesTheme {
  id: string;
  name: string;
  author?: string;
  version: number;          // Schema version for forward compat
  isBuiltIn: boolean;
  colors: ThemeColors;
}

export interface ThemeSettings {
  activeThemeId: string;
  accentColorOverride?: string;   // Null = use theme default
  fontSize: "small" | "default" | "large" | "xlarge";
  compactMode: boolean;
  respectNodeThemes: boolean;     // True = apply Node themes when entering Nodes
  customThemes: NodesTheme[];
}

export const BUILT_IN_THEMES: NodesTheme[] = [
  {
    id: "dark",
    name: "Dark",
    isBuiltIn: true,
    version: 1,
    colors: {
      bgPrimary: "#1e1e2e",
      bgSecondary: "#181825",
      bgTertiary: "#313244",
      bgInput: "#1e1e2e",
      bgHover: "#2a2a3c",
      textPrimary: "#cdd6f4",
      textSecondary: "#a6adc8",
      textMuted: "#585b70",
      accent: "#7c3aed",
      accentHover: "#6d28d9",
      accentMuted: "rgba(124, 58, 237, 0.15)",
      accentText: "#ffffff",
      danger: "#f38ba8",
      dangerHover: "#e06688",
      success: "#a6e3a1",
      warning: "#f9e2af",
      info: "#89b4fa",
      border: "#313244",
      borderStrong: "#45475a",
      mentionBg: "rgba(124, 58, 237, 0.3)",
      mentionText: "#cba6f7",
      codeBg: "#11111b",
      linkColor: "#89b4fa",
    },
  },
  {
    id: "light",
    name: "Light",
    isBuiltIn: true,
    version: 1,
    colors: {
      bgPrimary: "#ffffff",
      bgSecondary: "#f5f5f5",
      bgTertiary: "#e8e8e8",
      bgInput: "#ffffff",
      bgHover: "#ebebeb",
      textPrimary: "#1a1a1a",
      textSecondary: "#555555",
      textMuted: "#999999",
      accent: "#7c3aed",
      accentHover: "#6d28d9",
      accentMuted: "rgba(124, 58, 237, 0.1)",
      accentText: "#ffffff",
      danger: "#dc2626",
      dangerHover: "#b91c1c",
      success: "#16a34a",
      warning: "#d97706",
      info: "#2563eb",
      border: "#e0e0e0",
      borderStrong: "#cccccc",
      mentionBg: "rgba(124, 58, 237, 0.15)",
      mentionText: "#7c3aed",
      codeBg: "#f0f0f0",
      linkColor: "#2563eb",
    },
  },
  {
    id: "oled",
    name: "OLED Black",
    isBuiltIn: true,
    version: 1,
    colors: {
      bgPrimary: "#000000",
      bgSecondary: "#0a0a0a",
      bgTertiary: "#1a1a1a",
      bgInput: "#0a0a0a",
      bgHover: "#1a1a1a",
      textPrimary: "#e0e0e0",
      textSecondary: "#999999",
      textMuted: "#555555",
      accent: "#22c55e",
      accentHover: "#16a34a",
      accentMuted: "rgba(34, 197, 94, 0.15)",
      accentText: "#ffffff",
      danger: "#ef4444",
      dangerHover: "#dc2626",
      success: "#22c55e",
      warning: "#f59e0b",
      info: "#3b82f6",
      border: "#1a1a1a",
      borderStrong: "#2a2a2a",
      mentionBg: "rgba(34, 197, 94, 0.2)",
      mentionText: "#4ade80",
      codeBg: "#0a0a0a",
      linkColor: "#60a5fa",
    },
  },
  {
    id: "midnight",
    name: "Midnight Blue",
    isBuiltIn: true,
    version: 1,
    colors: {
      bgPrimary: "#0f172a",
      bgSecondary: "#0c1222",
      bgTertiary: "#1e293b",
      bgInput: "#0f172a",
      bgHover: "#1a2744",
      textPrimary: "#e2e8f0",
      textSecondary: "#94a3b8",
      textMuted: "#475569",
      accent: "#3b82f6",
      accentHover: "#2563eb",
      accentMuted: "rgba(59, 130, 246, 0.15)",
      accentText: "#ffffff",
      danger: "#f87171",
      dangerHover: "#ef4444",
      success: "#4ade80",
      warning: "#fbbf24",
      info: "#60a5fa",
      border: "#1e293b",
      borderStrong: "#334155",
      mentionBg: "rgba(59, 130, 246, 0.3)",
      mentionText: "#93c5fd",
      codeBg: "#0c1222",
      linkColor: "#60a5fa",
    },
  },
  {
    id: "forest",
    name: "Forest",
    isBuiltIn: true,
    version: 1,
    colors: {
      bgPrimary: "#1a2e1a",
      bgSecondary: "#142414",
      bgTertiary: "#2d4a2d",
      bgInput: "#1a2e1a",
      bgHover: "#243824",
      textPrimary: "#d4e8d4",
      textSecondary: "#9ab89a",
      textMuted: "#5a7a5a",
      accent: "#22c55e",
      accentHover: "#16a34a",
      accentMuted: "rgba(34, 197, 94, 0.15)",
      accentText: "#ffffff",
      danger: "#f87171",
      dangerHover: "#ef4444",
      success: "#4ade80",
      warning: "#fbbf24",
      info: "#60a5fa",
      border: "#2d4a2d",
      borderStrong: "#3d6a3d",
      mentionBg: "rgba(34, 197, 94, 0.3)",
      mentionText: "#86efac",
      codeBg: "#142414",
      linkColor: "#86efac",
    },
  },
  {
    id: "sunset",
    name: "Sunset",
    isBuiltIn: true,
    version: 1,
    colors: {
      bgPrimary: "#2d1b2e",
      bgSecondary: "#231424",
      bgTertiary: "#3d2b3e",
      bgInput: "#2d1b2e",
      bgHover: "#3a2540",
      textPrimary: "#f0ddf2",
      textSecondary: "#c4a0c8",
      textMuted: "#7a5a7e",
      accent: "#f97316",
      accentHover: "#ea580c",
      accentMuted: "rgba(249, 115, 22, 0.15)",
      accentText: "#ffffff",
      danger: "#f87171",
      dangerHover: "#ef4444",
      success: "#4ade80",
      warning: "#fbbf24",
      info: "#60a5fa",
      border: "#3d2b3e",
      borderStrong: "#5a4060",
      mentionBg: "rgba(249, 115, 22, 0.3)",
      mentionText: "#fdba74",
      codeBg: "#231424",
      linkColor: "#fdba74",
    },
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk",
    isBuiltIn: true,
    version: 1,
    colors: {
      bgPrimary: "#0a0a1a",
      bgSecondary: "#060612",
      bgTertiary: "#14142a",
      bgInput: "#0a0a1a",
      bgHover: "#141430",
      textPrimary: "#e0e0ff",
      textSecondary: "#8888cc",
      textMuted: "#444488",
      accent: "#ff00ff",
      accentHover: "#cc00cc",
      accentMuted: "rgba(255, 0, 255, 0.15)",
      accentText: "#ffffff",
      danger: "#ff3366",
      dangerHover: "#cc2952",
      success: "#00ff88",
      warning: "#ffff00",
      info: "#00ccff",
      border: "#1a1a3a",
      borderStrong: "#2a2a5a",
      mentionBg: "rgba(255, 0, 255, 0.3)",
      mentionText: "#ff66ff",
      codeBg: "#060612",
      linkColor: "#00ccff",
    },
  },
];
