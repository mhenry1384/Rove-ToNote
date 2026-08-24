import { FilePlus, FolderPlus, KeyRound, ListPlus, Trash2 } from "lucide-react";
import { useDocumentStore } from "../../document/documentStore";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { useTreeFilterStore } from "../../stores/useTreeFilterStore";
import { deleteNoteWithUndo, isNoteEmpty } from "../../document/noteActions";
import type { NoteType } from "../../document/types";

const TITLES: Record<NoteType, string> = {
  markdown: "New Note",
  todo: "New To-Do List",
  folder: "New Folder",
  "password-grid": "New Password Grid",
};

export function TreeToolbar() {
  const selectedNoteId = useSelectionStore((s) => s.selectedNoteId);
  const isFiltering = useTreeFilterStore((s) => s.query.trim().length > 0);

  async function handleAdd(type: NoteType) {
    const doc = useDocumentStore.getState().doc;
    const selected = doc?.notes.find((n) => n.id === selectedNoteId);
    const parentId = selected?.parentId ?? null;
    const title = TITLES[type];

    const existingBlank = doc?.notes.find(
      (n) =>
        n.parentId === parentId &&
        n.type === type &&
        n.title === title &&
        isNoteEmpty(n, doc.notes),
    );
    if (existingBlank) {
      useSelectionStore.getState().selectAndRename(existingBlank.id);
      return;
    }

    const note = useDocumentStore.getState().createNote(parentId, title, type);
    useSelectionStore.getState().selectAndRename(note.id);
  }

  function handleDelete() {
    if (!selectedNoteId) return;
    deleteNoteWithUndo(selectedNoteId);
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
        title="New password grid"
        onClick={() => void handleAdd("password-grid")}
      >
        <KeyRound size={16} />
      </button>
      <button
        type="button"
        className="icon-button"
        title={isFiltering ? "Clear the filter to create a folder" : "New folder"}
        disabled={isFiltering}
        onClick={() => void handleAdd("folder")}
      >
        <FolderPlus size={16} />
      </button>
      <button
        type="button"
        className="icon-button"
        title="Delete selected note"
        disabled={!selectedNoteId}
        onClick={handleDelete}
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
