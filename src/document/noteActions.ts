import { ask } from "@tauri-apps/plugin-dialog";
import { useDocumentStore } from "./documentStore";
import { parseTodoMarkdown } from "./todoMarkdown";
import type { NoteMeta } from "./types";
import { useSelectionStore } from "../stores/useSelectionStore";

function isNoteEmpty(note: NoteMeta): boolean {
  if (note.type === "todo") {
    return parseTodoMarkdown(note.content).items.length === 0;
  }
  return note.content.trim() === "";
}

/** Confirms (if the note has children or content) and deletes it, clearing
 * the selection if the deleted note was selected. */
export async function confirmAndDeleteNote(noteId: string): Promise<void> {
  const doc = useDocumentStore.getState().doc;
  const note = doc?.notes.find((n) => n.id === noteId);
  if (!note) return;
  const hasChildren = doc?.notes.some((n) => n.parentId === note.id);
  if (hasChildren || !isNoteEmpty(note)) {
    const confirmed = await ask(
      hasChildren
        ? `Delete "${note.title}" and everything inside it? This can't be undone.`
        : `Delete "${note.title}"? This can't be undone.`,
      { title: "ToNote", kind: "warning" },
    );
    if (!confirmed) return;
  }
  useDocumentStore.getState().deleteNote(note.id);
  if (useSelectionStore.getState().selectedNoteId === note.id) {
    useSelectionStore.getState().select(null);
  }
}
