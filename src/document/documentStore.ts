import { create } from "zustand";
import { backupIfNeeded } from "./backup";
import { readDocumentFile, writeDocumentFile } from "./fileIO";
import { appendSortOrder, betweenSortOrder } from "./sortOrder";
import { collectSubtreeIds } from "./treeUtils";
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
/** How many deleted notes/to-do lists to keep undoable while the app is
 * running. Session-only — it's fine to lose this history when the app
 * closes, so it never touches the saved document. */
const MAX_DELETED_STACK = 10;

/** One delete operation's worth of undo state: the removed note plus its
 * whole subtree, exactly as it was, so restoreNote can splice it straight
 * back into `doc.notes`. */
export interface DeletedEntry {
  rootId: string;
  deletedAt: string;
  notes: NoteMeta[];
}

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
  /** True once the doc has changed since the last backup snapshot — cleared
   * after a successful backup, independent of isDirty/save. */
  changedSinceBackup: boolean;
  /** Most-recently-deleted first; capped at MAX_DELETED_STACK. Not part of
   * ToNoteDocument, so it never gets written to disk. */
  deletedStack: DeletedEntry[];

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
  /** Bulk version of setEncrypted — commits every note in one mutation, for
   * folder-wide "Encrypt All" / "Decrypt All". */
  setEncryptedBulk: (entries: { id: string; content: string }[], encrypted: boolean) => void;
  setVault: (vault: VaultInfo) => void;
  /** Applies a vault password change: swaps in the new vault info (salt/kdf/verifier)
   * and each re-encrypted note's content in one atomic update. Encryption
   * itself lives in crypto/ + vaultActions.ts. */
  applyVaultPasswordChange: (vault: VaultInfo, reEncryptedContent: Map<string, string>) => void;
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
    set({ doc: mutator(doc), isDirty: true, changedSinceBackup: true });
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
    changedSinceBackup: false,
    deletedStack: [],

    driveSyncStatus: "idle",
    driveConflict: null,

    newDocument: async (path) => {
      const prev = get();
      await backupIfNeeded(prev.source, prev.doc, prev.changedSinceBackup).catch(() => {});
      clearAutosaveTimer();
      stopDrivePolling();
      const doc = createEmptyDocument();
      set({
        source: { kind: "local", path },
        doc,
        isDirty: false,
        loadError: null,
        changedSinceBackup: false,
        deletedStack: [],
        driveSyncStatus: "idle",
        driveConflict: null,
      });
      await writeDocumentFile(path, doc);
    },

    openDocument: async (path) => {
      const prev = get();
      await backupIfNeeded(prev.source, prev.doc, prev.changedSinceBackup).catch(() => {});
      clearAutosaveTimer();
      stopDrivePolling();
      try {
        const doc = await readDocumentFile(path);
        set({
          source: { kind: "local", path },
          doc,
          isDirty: false,
          loadError: null,
          changedSinceBackup: false,
          deletedStack: [],
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
      const prev = get();
      await backupIfNeeded(prev.source, prev.doc, prev.changedSinceBackup).catch(() => {});
      clearAutosaveTimer();
      stopDrivePolling();
      try {
        const { doc, revisionId } = await readDriveDocument(fileId);
        set({
          source: { kind: "drive", fileId, name, revisionId },
          doc,
          isDirty: false,
          loadError: null,
          changedSinceBackup: false,
          deletedStack: [],
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
      const prev = get();
      void backupIfNeeded(prev.source, prev.doc, prev.changedSinceBackup);
      clearAutosaveTimer();
      stopDrivePolling();
      set({
        source: null,
        doc: null,
        isDirty: false,
        loadError: null,
        changedSinceBackup: false,
        deletedStack: [],
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
      const { doc, deletedStack } = get();
      if (!doc) return;
      const idsToRemove = collectSubtreeIds(doc.notes, id);
      const removed = doc.notes.filter((n) => idsToRemove.has(n.id));
      if (removed.length === 0) return;
      const entry: DeletedEntry = { rootId: id, deletedAt: nowIso(), notes: removed };
      set({
        doc: { ...doc, notes: doc.notes.filter((n) => !idsToRemove.has(n.id)) },
        isDirty: true,
        changedSinceBackup: true,
        deletedStack: [entry, ...deletedStack].slice(0, MAX_DELETED_STACK),
      });
      armAutosave();
    },

    restoreNote: (rootId) => {
      const { doc, deletedStack } = get();
      if (!doc) return;
      const entry = deletedStack.find((e) => e.rootId === rootId);
      if (!entry) return;
      // If the note's old parent no longer exists (e.g. it was deleted
      // separately and never restored), fall back to restoring at the top
      // level rather than dropping the note.
      const liveIds = new Set(doc.notes.map((n) => n.id));
      const restored = entry.notes.map((n) =>
        n.id === rootId && n.parentId && !liveIds.has(n.parentId)
          ? { ...n, parentId: null }
          : n,
      );
      set({
        doc: { ...doc, notes: [...doc.notes, ...restored] },
        isDirty: true,
        changedSinceBackup: true,
        deletedStack: deletedStack.filter((e) => e.rootId !== rootId),
      });
      armAutosave();
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

    setEncryptedBulk: (entries, encrypted) => {
      const byId = new Map(entries.map((e) => [e.id, e.content]));
      mutate((doc) => ({
        ...doc,
        notes: doc.notes.map((n) =>
          byId.has(n.id)
            ? { ...n, isEncrypted: encrypted, content: byId.get(n.id)!, updatedAt: nowIso() }
            : n,
        ),
      }));
    },

    setVault: (vault) => {
      mutate((doc) => ({ ...doc, vault }));
    },

    applyVaultPasswordChange: (vault, reEncryptedContent) => {
      mutate((doc) => ({
        ...doc,
        vault,
        notes: doc.notes.map((n) =>
          reEncryptedContent.has(n.id)
            ? { ...n, content: reEncryptedContent.get(n.id)!, updatedAt: nowIso() }
            : n,
        ),
      }));
    },
  };
});
