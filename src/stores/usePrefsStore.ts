import { create } from "zustand";
import {
  isNoteExpanded,
  loadPrefs,
  savePrefs,
  withNoteExpanded,
  type Prefs,
} from "../document/prefs";

interface PrefsState {
  prefs: Prefs;
  isLoaded: boolean;
  load: () => Promise<void>;
  setLastOpenedFilePath: (path: string | null) => Promise<void>;
  isExpanded: (filePath: string, noteId: string) => boolean;
  setExpanded: (
    filePath: string,
    noteId: string,
    expanded: boolean,
  ) => Promise<void>;
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  prefs: { lastOpenedFilePath: null, treeExpandState: {} },
  isLoaded: false,

  load: async () => {
    const prefs = await loadPrefs();
    set({ prefs, isLoaded: true });
  },

  setLastOpenedFilePath: async (path) => {
    const next = { ...get().prefs, lastOpenedFilePath: path };
    set({ prefs: next });
    await savePrefs(next);
  },

  isExpanded: (filePath, noteId) =>
    isNoteExpanded(get().prefs, filePath, noteId),

  setExpanded: async (filePath, noteId, expanded) => {
    const next = withNoteExpanded(get().prefs, filePath, noteId, expanded);
    set({ prefs: next });
    await savePrefs(next);
  },
}));
