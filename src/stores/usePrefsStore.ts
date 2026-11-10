import { create } from "zustand";
import {
  defaultPrefs,
  isNoteExpanded,
  loadPrefs,
  savePrefs,
  withCustomDictionaryWord,
  withNoteExpanded,
  withRecentBackgroundImageUrl,
  withRecentEmoji,
  withoutRecentBackgroundImageUrl,
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
  addRecentBackgroundImageUrl: (url: string) => Promise<void>;
  removeRecentBackgroundImageUrl: (url: string) => Promise<void>;
  addRecentEmoji: (emoji: string) => Promise<void>;
  addCustomDictionaryWord: (word: string) => Promise<void>;
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  prefs: defaultPrefs(),
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

  addRecentBackgroundImageUrl: async (url) => {
    const next = withRecentBackgroundImageUrl(get().prefs, url);
    set({ prefs: next });
    await savePrefs(next);
  },

  removeRecentBackgroundImageUrl: async (url) => {
    const next = withoutRecentBackgroundImageUrl(get().prefs, url);
    set({ prefs: next });
    await savePrefs(next);
  },

  addRecentEmoji: async (emoji) => {
    const next = withRecentEmoji(get().prefs, emoji);
    set({ prefs: next });
    await savePrefs(next);
  },

  addCustomDictionaryWord: async (word) => {
    const next = withCustomDictionaryWord(get().prefs, word);
    set({ prefs: next });
    await savePrefs(next);
  },
}));
