import { create } from "zustand";
import {
  isNoteExpanded,
  loadPrefs,
  savePrefs,
  withNoteExpanded,
  type Prefs,
} from "../document/prefs";
import type { DocumentSource } from "../document/documentSource";

interface PrefsState {
  prefs: Prefs;
  isLoaded: boolean;
  load: () => Promise<void>;
  setLastOpenedSource: (source: DocumentSource | null) => Promise<void>;
  isExpanded: (docKey: string, noteId: string) => boolean;
  setExpanded: (
    docKey: string,
    noteId: string,
    expanded: boolean,
  ) => Promise<void>;
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  prefs: { lastOpenedSource: null, treeExpandState: {} },
  isLoaded: false,

  load: async () => {
    const prefs = await loadPrefs();
    set({ prefs, isLoaded: true });
  },

  setLastOpenedSource: async (source) => {
    const next = { ...get().prefs, lastOpenedSource: source };
    set({ prefs: next });
    await savePrefs(next);
  },

  isExpanded: (docKey, noteId) => isNoteExpanded(get().prefs, docKey, noteId),

  setExpanded: async (docKey, noteId, expanded) => {
    const next = withNoteExpanded(get().prefs, docKey, noteId, expanded);
    set({ prefs: next });
    await savePrefs(next);
  },
}));
