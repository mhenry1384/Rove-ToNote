import { useDocumentStore } from "./documentStore";
import { parseTodoMarkdown } from "./todoMarkdown";
import type { NoteMeta } from "./types";
import { useSelectionStore } from "../stores/useSelectionStore";
import { useToastStore } from "../stores/useToastStore";
import { useVaultStore } from "../stores/useVaultStore";
import {
  decryptString,
  encryptString,
  parseEnvelope,
  serializeEnvelope,
} from "./crypto/vaultCrypto";

export function isNoteEmpty(note: NoteMeta): boolean {
  if (note.type === "todo") {
    return parseTodoMarkdown(note.content).items.length === 0;
  }
  return note.content.trim() === "";
}

/** Soft-deletes a note (and its children), clearing the selection if the
 * deleted note was selected, and offers an "Undo" toast to restore it. Up to
 * five deleted notes are kept around for undo before being purged for good. */
export function deleteNoteWithUndo(noteId: string): void {
  const doc = useDocumentStore.getState().doc;
  const note = doc?.notes.find((n) => n.id === noteId);
  if (!note) return;
  useDocumentStore.getState().deleteNote(noteId);
  if (useSelectionStore.getState().selectedNoteId === noteId) {
    useSelectionStore.getState().select(null);
  }
  useToastStore.getState().show(`"${note.title}" deleted`, {
    label: "Undo",
    onAction: () => {
      useDocumentStore.getState().restoreNote(noteId);
      useSelectionStore.getState().select(noteId);
    },
  });
}

/** Prompts for the vault password if needed (setting one up on first use),
 * then encrypts the note's content in place. */
export async function encryptNote(noteId: string): Promise<void> {
  const before = useDocumentStore.getState().doc?.notes.find((n) => n.id === noteId);
  if (!before || before.isEncrypted) return;

  const unlocked = await useVaultStore.getState().ensureUnlocked();
  if (!unlocked) return;
  const key = useVaultStore.getState().key;
  const note = useDocumentStore.getState().doc?.notes.find((n) => n.id === noteId);
  if (!key || !note || note.isEncrypted) return;

  const envelope = await encryptString(key, note.content);
  useDocumentStore.getState().setEncrypted(noteId, true, serializeEnvelope(envelope));
}

/** Prompts for the vault password if needed, then decrypts the note's
 * content back to plaintext in place. */
export async function decryptNote(noteId: string): Promise<void> {
  const before = useDocumentStore.getState().doc?.notes.find((n) => n.id === noteId);
  if (!before || !before.isEncrypted) return;

  const unlocked = await useVaultStore.getState().ensureUnlocked();
  if (!unlocked) return;
  const key = useVaultStore.getState().key;
  const note = useDocumentStore.getState().doc?.notes.find((n) => n.id === noteId);
  if (!key || !note || !note.isEncrypted) return;

  const plaintext = await decryptString(key, parseEnvelope(note.content));
  useDocumentStore.getState().setEncrypted(noteId, false, plaintext);
}
