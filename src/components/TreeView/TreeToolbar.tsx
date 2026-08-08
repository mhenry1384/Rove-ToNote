import { FilePlus, ListPlus, Trash2 } from "lucide-react";
import { useDocumentStore } from "../../document/documentStore";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { confirmAndDeleteNote } from "../../document/noteActions";
import type { NoteType } from "../../document/types";

export function TreeToolbar() {
  const selectedNoteId = useSelectionStore((s) => s.selectedNoteId);

  async function handleAdd(type: NoteType) {
    const doc = useDocumentStore.getState().doc;
    const selected = doc?.notes.find((n) => n.id === selectedNoteId);
    const parentId = selected?.parentId ?? null;
    const title = type === "todo" ? "New To-Do List" : "New Note";
    const note = useDocumentStore.getState().createNote(parentId, title, type);
    useSelectionStore.getState().selectAndRename(note.id);
  }

  async function handleDelete() {
    if (!selectedNoteId) return;
    await confirmAndDeleteNote(selectedNoteId);
  }

  return (
    <div className="tree-toolbar">
      <button
        type="button"
        className="icon-button"
        title="New note"
        onClick={() => void handleAdd("markdown")}
      >
        <FilePlus size={16} />
      </button>
      <button
        type="button"
        className="icon-button"
        title="New to-do list"
        onClick={() => void handleAdd("todo")}
      >
        <ListPlus size={16} />
      </button>
      <button
        type="button"
        className="icon-button"
        title="Delete selected note"
        disabled={!selectedNoteId}
        onClick={() => void handleDelete()}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
