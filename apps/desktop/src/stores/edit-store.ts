import { create } from "zustand";

interface EditState {
  // Map: messageId → editing mode (true/false)
  editingMessages: Record<string, boolean>;
  // Original content before editing (for cancel)
  originalContent: Record<string, string>;

  // Actions
  startEditing: (messageId: string, content: string) => void;
  stopEditing: (messageId: string) => void;
  isEditing: (messageId: string) => boolean;
  getOriginalContent: (messageId: string) => string | undefined;
}

export const useEditStore = create<EditState>((set, get) => ({
  editingMessages: {},
  originalContent: {},

  startEditing: (messageId, content) => {
    set((state) => ({
      editingMessages: {
        ...state.editingMessages,
        [messageId]: true,
      },
      originalContent: {
        ...state.originalContent,
        [messageId]: content,
      },
    }));
  },

  stopEditing: (messageId) => {
    set((state) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [messageId]: _edit, ...restEdit } = state.editingMessages;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [messageId]: _orig, ...restOrig } = state.originalContent;
      return {
        editingMessages: restEdit,
        originalContent: restOrig,
      };
    });
  },

  isEditing: (messageId) => {
    return get().editingMessages[messageId] ?? false;
  },

  getOriginalContent: (messageId) => {
    return get().originalContent[messageId];
  },
}));
