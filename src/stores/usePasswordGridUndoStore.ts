import { create } from "zustand";
import type { PasswordEntry } from "../document/passwordGrid";

/** How many deleted rows to keep undoable per password-grid note. Session-only
 * (kept in memory, cleared when the document is closed/switched — see
 * App.tsx's sourceKey effect — or when the app closes) — deletes here skip
 * the confirmation dialog entirely, so this is the safety net instead. */
const MAX_DELETED_PER_NOTE = 10;

interface PasswordGridUndoState {
  /** noteId -> most-recently-deleted-first entries. */
  deletedByNote: Record<string, PasswordEntry[]>;
  pushDeleted: (noteId: string, entry: PasswordEntry) => void;
  /** Pops and returns the most recently deleted entry for `noteId`, or null if none. */
  popDeleted: (noteId: string) => PasswordEntry | null;
  clear: () => void;
}

export const usePasswordGridUndoStore = create<PasswordGridUndoState>((set, get) => ({
  deletedByNote: {},

  pushDeleted: (noteId, entry) => {
    const existing = get().deletedByNote[noteId] ?? [];
    set({
      deletedByNote: {
        ...get().deletedByNote,
        [noteId]: [entry, ...existing].slice(0, MAX_DELETED_PER_NOTE),
      },
    });
  },

  popDeleted: (noteId) => {
    const existing = get().deletedByNote[noteId] ?? [];
    if (existing.length === 0) return null;
    const [top, ...rest] = existing;
    set({ deletedByNote: { ...get().deletedByNote, [noteId]: rest } });
    return top;
  },

  clear: () => set({ deletedByNote: {} }),
}));
