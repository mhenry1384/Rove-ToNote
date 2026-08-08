import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { TodoNote } from "../../document/todoMarkdown";

interface TodoItemNotesProps {
  notes: TodoNote[];
  onNoteTextChange: (noteId: string, text: string) => void;
  onNoteDelete: (noteId: string) => void;
  onAddNote: () => void;
  focusNoteId: string | null;
  canAddNote: boolean;
}

export function TodoItemNotes({
  notes,
  onNoteTextChange,
  onNoteDelete,
  onAddNote,
  focusNoteId,
  canAddNote,
}: TodoItemNotesProps) {
  return (
    <div className="todo-item-notes">
      {notes.map((note) => (
        <TodoNoteRow
          key={note.id}
          note={note}
          autoFocus={note.id === focusNoteId}
          onTextChange={(text) => onNoteTextChange(note.id, text)}
          onDelete={() => onNoteDelete(note.id)}
        />
      ))}
      <button
        type="button"
        className="todo-item-notes__add"
        disabled={!canAddNote}
        title={canAddNote ? undefined : "Finish the blank note before adding another"}
        onClick={onAddNote}
      >
        + Add note
      </button>
    </div>
  );
}

function TodoNoteRow({
  note,
  autoFocus,
  onTextChange,
  onDelete,
}: {
  note: TodoNote;
  autoFocus: boolean;
  onTextChange: (text: string) => void;
  onDelete: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
    // Only focus once, when this row is first mounted for a newly added note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="todo-item-notes__note">
      <textarea
        ref={textareaRef}
        className="todo-item-notes__textarea"
        value={note.text}
        rows={Math.max(1, note.text.split("\n").length)}
        onChange={(e) => onTextChange(e.target.value)}
      />
      <button
        type="button"
        className="todo-item-notes__delete"
        title="Delete note"
        onClick={onDelete}
      >
        <X size={12} />
      </button>
    </div>
  );
}
