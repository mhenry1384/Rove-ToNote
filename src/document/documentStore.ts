import { create } from "zustand";
import { readDocumentFile, writeDocumentFile } from "./fileIO";
import { appendSortOrder, betweenSortOrder } from "./sortOrder";
import { collectDeletionSubtreeIds, getDeletionRoots } from "./treeUtils";
import { createEmptyTodoDoc, serializeTodoMarkdown } from "./todoMarkdown";
import { createDriveDocument, readDriveDocument, writeDriveDocument } from "./drive/driveFileIO";
import { DEFAULT_BACKGROUND_IMAGE_OPACITY } from "./noteColors";
import { startPolling } from "./drive/polling";
import type { DriveFileMetadata } from "./drive/driveApi";
import type { DocumentSource } from "./documentSource";
import {
  createEmptyDocument,
  type NoteMeta,
  type NoteType,
  type ToNoteDocument,
  type VaultInfo,
} from "./types";

const AUTOSAVE_DELAY_MS = 30_000;
/** How many soft-deleted subtrees to keep around for undo before permanently purging the oldest. */
const MAX_DELETED_ROOTS = 5;

type DriveSyncStatus = "idle" | "checking" | "conflict";

interface DriveConflict {
  remoteModifiedTime: string;
}

interface DocumentState {
  source: DocumentSource | null;
  doc: ToNoteDocument | null;
  isDirty: boolean;
  isSaving: boolean;
  loadError: string | null;

  driveSyncStatus: DriveSyncStatus;
  driveConflict: DriveConflict | null;

  newDocument: (path: string) => Promise<void>;
  openDocument: (path: string) => Promise<void>;
  openFromDrive: (fileId: string, name: string) => Promise<void>;
  saveCopyToDrive: (name: string) => Promise<void>;
  save: () => Promise<void>;
  saveAs: (path: string) => Promise<void>;
  resolveDriveConflict: (choice: "keep-local" | "discard-local") => Promise<void>;
  closeDocument: () => void;

  createNote: (
    parentId: string | null,
    title: string,
    type: NoteType,
  ) => NoteMeta;
  deleteNote: (id: string) => void;
  restoreNote: (id: string) => void;
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
  setNoteColor: (id: string, color: string | null) => void;
  setNoteBackgroundImage: (id: string, url: string | null, opacity?: number | null) => void;
  /** Content must already be plaintext or ciphertext-envelope JSON as appropriate — encryption itself lives in crypto/. */
  setEncrypted: (id: string, encrypted: boolean, content: string) => void;
  setVault: (vault: VaultInfo) => void;
}

let autosaveTimer: ReturnType<typeof setTimeout> | null = null;
let drivePollStop: (() => void) | null = null;

function clearAutosaveTimer() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
  }
}

function stopDrivePolling() {
  drivePollStop?.();
  drivePollStop = null;
}

function nowIso(): string {
  return new Date().toISOString();
}

/** Permanently drops the oldest soft-deleted subtrees once more than
 * MAX_DELETED_ROOTS are being kept around for undo. */
function pruneOldDeletions(notes: NoteMeta[]): NoteMeta[] {
  const roots = getDeletionRoots(notes).sort((a, b) =>
    (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""),
  );
  const excess = roots.slice(MAX_DELETED_ROOTS);
  if (excess.length === 0) return notes;
  const purgeIds = new Set<string>();
  for (const root of excess) {
    for (const id of collectDeletionSubtreeIds(notes, root.id)) purgeIds.add(id);
  }
  return notes.filter((n) => !purgeIds.has(n.id));
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

  function startDrivePollingFor(fileId: string) {
    stopDrivePolling();
    drivePollStop = startPolling(fileId, (meta: DriveFileMetadata) => {
      void handleDrivePollTick(fileId, meta);
    });
  }

  async function handleDrivePollTick(fileId: string, meta: DriveFileMetadata) {
    const { source, isDirty } = get();
    // Stale callback guard: the doc may have been closed/switched since this
    // poll fired.
    if (!source || source.kind !== "drive" || source.fileId !== fileId) return;
    if (meta.headRevisionId === source.revisionId) return;

    if (isDirty) {
      set({
        driveSyncStatus: "conflict",
        driveConflict: { remoteModifiedTime: meta.modifiedTime },
      });
      return;
    }

    set({ driveSyncStatus: "checking" });
    try {
      const { doc: freshDoc, revisionId } = await readDriveDocument(fileId);
      const current = get().source;
      if (!current || current.kind !== "drive" || current.fileId !== fileId) return;
      set({
        doc: freshDoc,
        source: { ...current, revisionId },
        driveSyncStatus: "idle",
      });
    } catch {
      set({ driveSyncStatus: "idle" });
    }
  }

  return {
    source: null,
    doc: null,
    isDirty: false,
    isSaving: false,
    loadError: null,

    driveSyncStatus: "idle",
    driveConflict: null,

    newDocument: async (path) => {
      clearAutosaveTimer();
      stopDrivePolling();
      const doc = createEmptyDocument();
      set({
        source: { kind: "local", path },
        doc,
        isDirty: false,
        loadError: null,
        driveSyncStatus: "idle",
        driveConflict: null,
      });
      await writeDocumentFile(path, doc);
    },

    openDocument: async (path) => {
      clearAutosaveTimer();
      stopDrivePolling();
      try {
        const doc = await readDocumentFile(path);
        set({
          source: { kind: "local", path },
          doc,
          isDirty: false,
          loadError: null,
          driveSyncStatus: "idle",
          driveConflict: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ loadError: message });
        throw err;
      }
    },

    openFromDrive: async (fileId, name) => {
      clearAutosaveTimer();
      stopDrivePolling();
      try {
        const { doc, revisionId } = await readDriveDocument(fileId);
        set({
          source: { kind: "drive", fileId, name, revisionId },
          doc,
          isDirty: false,
          loadError: null,
          driveSyncStatus: "idle",
          driveConflict: null,
        });
        startDrivePollingFor(fileId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        set({ loadError: message });
        throw err;
      }
    },

    saveCopyToDrive: async (name) => {
      const { doc } = get();
      if (!doc) throw new Error("No document open");
      clearAutosaveTimer();
      stopDrivePolling();
      set({ isSaving: true });
      try {
        const { fileId, revisionId } = await createDriveDocument(name, doc);
        set({
          source: { kind: "drive", fileId, name, revisionId },
          isDirty: false,
          driveSyncStatus: "idle",
          driveConflict: null,
        });
        startDrivePollingFor(fileId);
      } finally {
        set({ isSaving: false });
      }
    },

    save: async () => {
      const { doc, source, isDirty, driveConflict } = get();
      // Never let autosave silently resolve a pending conflict for the user.
      if (!doc || !source || !isDirty || driveConflict) return;
      clearAutosaveTimer();
      set({ isSaving: true });
      try {
        if (source.kind === "local") {
          await writeDocumentFile(source.path, doc);
        } else {
          const { revisionId } = await writeDriveDocument(source.fileId, doc);
          set({ source: { ...source, revisionId } });
        }
        set({ isDirty: false });
      } finally {
        set({ isSaving: false });
      }
    },

    saveAs: async (path) => {
      const { doc } = get();
      if (!doc) return;
      clearAutosaveTimer();
      stopDrivePolling();
      set({ isSaving: true });
      try {
        await writeDocumentFile(path, doc);
        set({
          source: { kind: "local", path },
          isDirty: false,
          driveSyncStatus: "idle",
          driveConflict: null,
        });
      } finally {
        set({ isSaving: false });
      }
    },

    resolveDriveConflict: async (choice) => {
      const { source } = get();
      if (!source || source.kind !== "drive") return;
      if (choice === "keep-local") {
        set({ driveConflict: null, driveSyncStatus: "idle" });
        await get().save();
      } else {
        clearAutosaveTimer();
        const { doc, revisionId } = await readDriveDocument(source.fileId);
        set({
          doc,
          source: { ...source, revisionId },
          isDirty: false,
          driveConflict: null,
          driveSyncStatus: "idle",
        });
      }
    },

    closeDocument: () => {
      clearAutosaveTimer();
      stopDrivePolling();
      set({
        source: null,
        doc: null,
        isDirty: false,
        loadError: null,
        driveSyncStatus: "idle",
        driveConflict: null,
      });
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
        const timestamp = nowIso();
        const idsToMark = new Set<string>();
        const collect = (targetId: string) => {
          idsToMark.add(targetId);
          for (const n of doc.notes) {
            // Leave already-deleted descendants alone — they belong to a
            // separate (earlier) delete operation with their own timestamp.
            if (n.parentId === targetId && !n.deletedAt) collect(n.id);
          }
        };
        collect(id);
        const notes = doc.notes.map((n) =>
          idsToMark.has(n.id) ? { ...n, deletedAt: timestamp } : n,
        );
        return { ...doc, notes: pruneOldDeletions(notes) };
      });
    },

    restoreNote: (id) => {
      mutate((doc) => {
        const ids = collectDeletionSubtreeIds(doc.notes, id);
        return {
          ...doc,
          notes: doc.notes.map((n) =>
            ids.has(n.id) ? { ...n, deletedAt: null } : n,
          ),
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

    setNoteColor: (id, color) => {
      mutate((doc) => ({
        ...doc,
        notes: doc.notes.map((n) =>
          n.id === id
            ? {
                ...n,
                color,
                backgroundImageUrl: null,
                backgroundImageOpacity: null,
                updatedAt: nowIso(),
              }
            : n,
        ),
      }));
    },

    setNoteBackgroundImage: (id, url, opacity) => {
      mutate((doc) => ({
        ...doc,
        notes: doc.notes.map((n) =>
          n.id === id
            ? {
                ...n,
                backgroundImageUrl: url,
                backgroundImageOpacity: url
                  ? (opacity ?? n.backgroundImageOpacity ?? DEFAULT_BACKGROUND_IMAGE_OPACITY)
                  : null,
                color: url ? null : n.color,
                updatedAt: nowIso(),
              }
            : n,
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
