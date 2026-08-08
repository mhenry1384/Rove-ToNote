import { create } from "zustand";
import { readDocumentFile, writeDocumentFile } from "./fileIO";
import { appendSortOrder, betweenSortOrder } from "./sortOrder";
import { createEmptyTodoDoc, serializeTodoMarkdown } from "./todoMarkdown";
import {
  createEmptyDocument,
  type NoteMeta,
  type NoteType,
  type ToNoteDocument,
  type VaultInfo,
} from "./types";

const AUTOSAVE_DELAY_MS = 30_000;

interface DocumentState {
  filePath: string | null;
  doc: ToNoteDocument | null;
  isDirty: boolean;
  isSaving: boolean;
  loadError: string | null;

  newDocument: (path: string) => Promise<void>;
  openDocument: (path: string) => Promise<void>;
  save: () => Promise<void>;
  saveAs: (path: string) => Promise<void>;
  closeDocument: () => void;

  createNote: (
    parentId: string | null,
    title: string,
    type: NoteType,
  ) => NoteMeta;
  deleteNote: (id: string) => void;
  renameNote: (id: string, title: string) => void;
  reparentNote: (id: string, newParentId: string | null) => void;
  moveWithinSiblings: (
    id: string,
    beforeId: string | null,
    afterId: string | null,
  ) => void;
  moveNote: (
    id: string,
    newParentId: string | null,
    beforeId: string | null,
    afterId: string | null,
  ) => void;
  setNoteContent: (id: string, content: string) => void;
  /** Content must already be plaintext or ciphertext-envelope JSON as appropriate — encryption itself lives in crypto/. */
  setEncrypted: (id: string, encrypted: boolean, content: string) => void;
  setVault: (vault: VaultInfo) => void;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

function clearAutosaveTimer() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

export const useDocumentStore = create<DocumentState>((set, get) => {
  function armAutosave() {
    clearAutosaveTimer();
    autosaveTimer = setTimeout(() => {
      autosaveTimer = null;
      void get().save();
    }, AUTOSAVE_DELAY_MS);
  }

  function mutate(mutator: (doc: ToNoteDocument) => ToNoteDocument) {
    const { doc } = get();
    if (!doc) return;
    set({ doc: mutator(doc), isDirty: true });
    armAutosave();
  }

  return {
    filePath: null,
    doc: null,
    isDirty: false,
    isSaving: false,
    loadError: null,

    newDocument: async (path) => {
      clearAutosaveTimer();
      const doc = createEmptyDocument();
      set({ filePath: path, doc, isDirty: false, loadError: null });
      await writeDocumentFile(path, doc);
    },

    openDocument: async (path) => {
      clearAutosaveTimer();
      try {
        const doc = await readDocumentFile(path);
        set({ filePath: path, doc, isDirty: false, loadError: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ loadError: message });
        throw err;
      }
    },

    save: async () => {
      const { doc, filePath, isDirty } = get();
      if (!doc || !filePath || !isDirty) return;
      clearAutosaveTimer();
      set({ isSaving: true });
      try {
        await writeDocumentFile(filePath, doc);
        set({ isDirty: false });
      } finally {
        set({ isSaving: false });
      }
    },

    saveAs: async (path) => {
      const { doc } = get();
      if (!doc) return;
      clearAutosaveTimer();
      set({ isSaving: true });
      try {
        await writeDocumentFile(path, doc);
        set({ filePath: path, isDirty: false });
      } finally {
        set({ isSaving: false });
      }
    },

    closeDocument: () => {
      clearAutosaveTimer();
      set({ filePath: null, doc: null, isDirty: false, loadError: null });
    },

    createNote: (parentId, title, type) => {
      const { doc } = get();
      if (!doc) throw new Error("No document open");
      const siblingOrders = doc.notes
        .filter((n) => n.parentId === parentId)
        .map((n) => n.sortOrder);
      const timestamp = nowIso();
      const note: NoteMeta = {
        id: crypto.randomUUID(),
        parentId,
        title,
        type,
        content:
          type === "todo" ? serializeTodoMarkdown(createEmptyTodoDoc()) : "",
        isEncrypted: false,
        sortOrder: appendSortOrder(siblingOrders),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      mutate((d) => ({ ...d, notes: [...d.notes, note] }));
      return note;
    },

    deleteNote: (id) => {
      mutate((doc) => {
        const idsToRemove = new Set<string>();
        const collect = (targetId: string) => {
          idsToRemove.add(targetId);
          for (const n of doc.notes) {
            if (n.parentId === targetId) collect(n.id);
          }
        };
        collect(id);
        return {
          ...doc,
          notes: doc.notes.filter((n) => !idsToRemove.has(n.id)),
        };
      });
    },

    renameNote: (id, title) => {
      mutate((doc) => ({
        ...doc,
        notes: doc.notes.map((n) =>
          n.id === id ? { ...n, title, updatedAt: nowIso() } : n,
        ),
      }));
    },

    reparentNote: (id, newParentId) => {
      mutate((doc) => {
        const siblingOrders = doc.notes
          .filter((n) => n.parentId === newParentId && n.id !== id)
          .map((n) => n.sortOrder);
        const sortOrder = appendSortOrder(siblingOrders);
        return {
          ...doc,
          notes: doc.notes.map((n) =>
            n.id === id
              ? { ...n, parentId: newParentId, sortOrder, updatedAt: nowIso() }
              : n,
          ),
        };
      });
    },

    moveWithinSiblings: (id, beforeId, afterId) => {
      mutate((doc) => {
        const before = beforeId
          ? (doc.notes.find((n) => n.id === beforeId)?.sortOrder ?? null)
          : null;
        const after = afterId
          ? (doc.notes.find((n) => n.id === afterId)?.sortOrder ?? null)
          : null;
        const sortOrder = betweenSortOrder(before, after);
        return {
          ...doc,
          notes: doc.notes.map((n) =>
            n.id === id ? { ...n, sortOrder, updatedAt: nowIso() } : n,
          ),
        };
      });
    },

    moveNote: (id, newParentId, beforeId, afterId) => {
      mutate((doc) => {
        const before = beforeId
          ? (doc.notes.find((n) => n.id === beforeId)?.sortOrder ?? null)
          : null;
        const after = afterId
          ? (doc.notes.find((n) => n.id === afterId)?.sortOrder ?? null)
          : null;
        const sortOrder = betweenSortOrder(before, after);
        return {
          ...doc,
          notes: doc.notes.map((n) =>
            n.id === id
              ? { ...n, parentId: newParentId, sortOrder, updatedAt: nowIso() }
              : n,
          ),
        };
      });
    },

    setNoteContent: (id, content) => {
      mutate((doc) => ({
        ...doc,
        notes: doc.notes.map((n) =>
          n.id === id ? { ...n, content, updatedAt: nowIso() } : n,
        ),
      }));
    },

    setEncrypted: (id, encrypted, content) => {
      mutate((doc) => ({
        ...doc,
        notes: doc.notes.map((n) =>
          n.id === id
            ? { ...n, isEncrypted: encrypted, content, updatedAt: nowIso() }
            : n,
        ),
      }));
    },

    setVault: (vault) => {
      mutate((doc) => ({ ...doc, vault }));
    },
  };
});
