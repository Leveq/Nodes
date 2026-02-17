/**
 * Global keyboard shortcuts hook.
 * Registers application-wide keybindings.
 */
import { useEffect } from 'react';

interface ShortcutHandlers {
  onOpenSettings?: () => void;
  onCloseModal?: () => void;
  onQuickSwitcher?: () => void;
  onToggleMute?: () => void;
  onToggleDeafen?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger shortcuts when typing in inputs
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || 
                      target.tagName === 'TEXTAREA' || 
                      target.isContentEditable;

      // Escape - close modals (always works)
      if (e.key === 'Escape' && handlers.onCloseModal) {
        handlers.onCloseModal();
        return;
      }

      // Ctrl/Cmd + , - open settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        handlers.onOpenSettings?.();
        return;
      }

      // Ctrl/Cmd + K - quick switcher
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && !isInput) {
        e.preventDefault();
        handlers.onQuickSwitcher?.();
        return;
      }

      // Ctrl/Cmd + Shift + M - toggle mute
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        handlers.onToggleMute?.();
        return;
      }

      // Ctrl/Cmd + Shift + D - toggle deafen
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        handlers.onToggleDeafen?.();
        return;
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}

/**
 * List of all keyboard shortcuts for help display.
 */
export const KEYBOARD_SHORTCUTS = [
  { key: 'Ctrl + ,', action: 'Open Settings', mac: '⌘ + ,' },
  { key: 'Escape', action: 'Close modal/popup', mac: 'Escape' },
  { key: 'Ctrl + K', action: 'Search messages', mac: '⌘ + K' },
  { key: 'Ctrl + Shift + M', action: 'Toggle mute', mac: '⌘ + Shift + M' },
  { key: 'Ctrl + Shift + D', action: 'Toggle deafen', mac: '⌘ + Shift + D' },
];
