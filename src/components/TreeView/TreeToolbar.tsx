import { FilePlus, FolderPlus, KeyRound, ListPlus, Trash2 } from "lucide-react";
import { useDocumentStore } from "../../document/documentStore";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { useTreeFilterStore } from "../../stores/useTreeFilterStore";
import { addNoteWithRename, deleteNoteWithUndo } from "../../document/noteActions";
import type { NoteType } from "../../document/types";

export function TreeToolbar() {
  const selectedNoteId = useSelectionStore((s) => s.selectedNoteId);
  const isFiltering = useTreeFilterStore((s) => s.query.trim().length > 0);

  async function handleAdd(type: NoteType) {
    const doc = useDocumentStore.getState().doc;
    const selected = doc?.notes.find((n) => n.id === selectedNoteId);
    addNoteWithRename(selected?.parentId ?? null, type);
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
