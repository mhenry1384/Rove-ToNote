import { create } from "zustand";

interface SelectionState {
  selectedNoteId: string | null;
  /** Set right after creating a note so its tree row can auto-enter rename mode once. */
  pendingRenameId: string | null;
  select: (id: string | null) => void;
  selectAndRename: (id: string) => void;
  clearPendingRename: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selectedNoteId: null,
  pendingRenameId: null,
  select: (id) => set({ selectedNoteId: id }),
  selectAndRename: (id) => set({ selectedNoteId: id, pendingRenameId: id }),
  clearPendingRename: () => set({ pendingRenameId: null }),
}));
