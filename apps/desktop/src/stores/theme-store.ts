import { create } from "zustand";
import type { NodesTheme, ThemeSettings } from "@nodes/core";
import { BUILT_IN_THEMES } from "@nodes/core";
import { ThemeEngine } from "../services/theme-engine";

interface ThemeStore {
  settings: ThemeSettings;
  allThemes: NodesTheme[];       // Built-in + custom
  nodeThemeOverride: NodesTheme | null;  // Temporary theme when in a Node with a theme

  // Actions
  setActiveTheme: (themeId: string) => void;
  setAccentColor: (color: string | undefined) => void;
  setFontSize: (size: ThemeSettings["fontSize"]) => void;
  setCompactMode: (compact: boolean) => void;
  setRespectNodeThemes: (respect: boolean) => void;
  addCustomTheme: (theme: NodesTheme) => void;
  updateCustomTheme: (theme: NodesTheme) => void;
  deleteCustomTheme: (themeId: string) => void;
  importTheme: (json: string) => NodesTheme | null;
  exportTheme: (themeId: string) => string | null;
  getActiveTheme: () => NodesTheme;
  
  // Node theme override
  applyNodeTheme: (theme: NodesTheme | null) => void;
  clearNodeTheme: () => void;
  
  // Persistence
  loadFromStorage: () => void;
  saveToStorage: () => void;
}

const DEFAULT_SETTINGS: ThemeSettings = {
  activeThemeId: "dark",
  accentColorOverride: undefined,
  fontSize: "default",
  compactMode: false,
  respectNodeThemes: true,
  customThemes: [],
};

export const useThemeStore = create<ThemeStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  allThemes: [...BUILT_IN_THEMES],
  nodeThemeOverride: null,

  setActiveTheme: (themeId) => {
    set((state) => ({
      settings: { ...state.settings, activeThemeId: themeId },
    }));
    
    // Apply the theme
    const theme = get().allThemes.find((t) => t.id === themeId) ?? BUILT_IN_THEMES[0];
    ThemeEngine.apply(theme, get().settings.accentColorOverride);
    get().saveToStorage();
  },

  setAccentColor: (color) => {
    set((state) => ({
      settings: { ...state.settings, accentColorOverride: color },
    }));
    
    // Apply the accent
    const theme = get().getActiveTheme();
    ThemeEngine.apply(theme, color);
    get().saveToStorage();
  },

  setFontSize: (fontSize) => {
    set((state) => ({
      settings: { ...state.settings, fontSize },
    }));
    ThemeEngine.setFontSize(fontSize);
    get().saveToStorage();
  },

  setCompactMode: (compactMode) => {
    set((state) => ({
      settings: { ...state.settings, compactMode },
    }));
    ThemeEngine.setCompactMode(compactMode);
    get().saveToStorage();
  },

  setRespectNodeThemes: (respectNodeThemes) => {
    set((state) => ({
      settings: { ...state.settings, respectNodeThemes },
    }));
    
    // If turning off, clear any active node theme
    if (!respectNodeThemes) {
      get().clearNodeTheme();
    }
    get().saveToStorage();
  },

  addCustomTheme: (theme) => {
    const { settings } = get();
    
    // Max 10 custom themes
    if (settings.customThemes.length >= 10) {
      return;
    }
    
    set({
      settings: {
        ...settings,
        customThemes: [...settings.customThemes, theme],
      },
      allThemes: [...BUILT_IN_THEMES, ...settings.customThemes, theme],
    });
    get().saveToStorage();
  },

  updateCustomTheme: (theme) => {
    set((state) => {
      const customs = state.settings.customThemes.map((t) =>
        t.id === theme.id ? theme : t
      );
      return {
        settings: { ...state.settings, customThemes: customs },
        allThemes: [...BUILT_IN_THEMES, ...customs],
      };
    });
    
    // Re-apply if this is the active theme
    if (get().settings.activeThemeId === theme.id) {
      ThemeEngine.apply(theme, get().settings.accentColorOverride);
    }
    get().saveToStorage();
  },

  deleteCustomTheme: (themeId) => {
    set((state) => {
      const customs = state.settings.customThemes.filter((t) => t.id !== themeId);
      const newActiveId =
        state.settings.activeThemeId === themeId ? "dark" : state.settings.activeThemeId;
      return {
        settings: { ...state.settings, customThemes: customs, activeThemeId: newActiveId },
        allThemes: [...BUILT_IN_THEMES, ...customs],
      };
    });
    
    // Re-apply if we switched themes
    const theme = get().getActiveTheme();
    ThemeEngine.apply(theme, get().settings.accentColorOverride);
    get().saveToStorage();
  },

  importTheme: (json) => {
    try {
      const theme = JSON.parse(json) as NodesTheme;
      
      // Validate required fields
      if (!theme.name || !theme.colors) {
        return null;
      }
      
      // Generate new ID and mark as not built-in
      const newTheme: NodesTheme = {
        ...theme,
        id: `custom_${Date.now()}`,
        isBuiltIn: false,
        version: theme.version ?? 1,
      };
      
      get().addCustomTheme(newTheme);
      return newTheme;
    } catch {
      return null;
    }
  },

  exportTheme: (themeId) => {
    const theme = get().allThemes.find((t) => t.id === themeId);
    if (!theme) return null;
    
    // Create export-friendly version without internal fields
    const exportTheme: NodesTheme = {
      id: theme.id,
      name: theme.name,
      author: theme.author,
      version: theme.version,
      isBuiltIn: false, // Exported themes are always custom
      colors: theme.colors,
    };
    
    return JSON.stringify(exportTheme, null, 2);
  },

  getActiveTheme: () => {
    const { activeThemeId } = get().settings;
    return get().allThemes.find((t) => t.id === activeThemeId) ?? BUILT_IN_THEMES[0];
  },

  applyNodeTheme: (theme) => {
    const { settings } = get();
    
    // Only apply if user respects Node themes
    if (!settings.respectNodeThemes || !theme) {
      return;
    }
    
    set({ nodeThemeOverride: theme });
    ThemeEngine.apply(theme, settings.accentColorOverride);
  },

  clearNodeTheme: () => {
    const { nodeThemeOverride, settings } = get();
    
    if (nodeThemeOverride) {
      set({ nodeThemeOverride: null });
      // Restore user's personal theme
      const theme = get().getActiveTheme();
      ThemeEngine.apply(theme, settings.accentColorOverride);
    }
  },

  loadFromStorage: () => {
    try {
      const stored = localStorage.getItem("nodes_theme_settings");
      if (stored) {
        const settings = JSON.parse(stored) as ThemeSettings;
        set({
          settings,
          allThemes: [...BUILT_IN_THEMES, ...settings.customThemes],
        });
      }
    } catch {
      // Use defaults
    }
  },

  saveToStorage: () => {
    const { settings } = get();
    localStorage.setItem("nodes_theme_settings", JSON.stringify(settings));
  },
}));

// Initialize theme from storage
useThemeStore.getState().loadFromStorage();
