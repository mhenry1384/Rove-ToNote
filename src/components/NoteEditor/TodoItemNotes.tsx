import { useLayoutEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import type { TodoNote } from "../../document/todoMarkdown";
import { containsUrl, linkify } from "./linkify";

interface TodoItemNotesProps {
  notes: TodoNote[];
  onNoteTextChange: (noteId: string, text: string) => void;
  onNoteDelete: (noteId: string) => void;
  onAddNote: () => void;
  focusNoteId: string | null;
  onNoteFocused: () => void;
  onLeaveNote: () => void;
  canAddNote: boolean;
}

export function TodoItemNotes({
  notes,
  onNoteTextChange,
  onNoteDelete,
  onAddNote,
  focusNoteId,
  onNoteFocused,
  onLeaveNote,
  canAddNote,
}: TodoItemNotesProps) {
  return (
    <div className="todo-item-notes">
      {notes.map((note) => (
        <TodoNoteRow
          key={note.id}
          note={note}
          autoFocus={note.id === focusNoteId}
          onAutoFocused={onNoteFocused}
          onLeave={onLeaveNote}
          onTextChange={(text) => onNoteTextChange(note.id, text)}
          onDelete={() => onNoteDelete(note.id)}
        />
      ))}
      <button
        type="button"
        className="todo-item-notes__add"
        disabled={!canAddNote}
        title={canAddNote ? undefined : "Finish the blank note before adding another"}
        // Keep focus inside the item so the notes panel doesn't collapse mid-click.
        onMouseDown={(e) => e.preventDefault()}
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
  onAutoFocused,
  onLeave,
  onTextChange,
  onDelete,
}: {
  note: TodoNote;
  autoFocus: boolean;
  onAutoFocused: () => void;
  onLeave: () => void;
  onTextChange: (text: string) => void;
  onDelete: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isTextFocused, setIsTextFocused] = useState(false);
  const showLinks = !isTextFocused && containsUrl(note.text);

  useLayoutEffect(() => {
    if (!autoFocus) return;
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
    // One-shot request: clear it so re-opening the notes panel later doesn't steal focus.
    onAutoFocused();
  }, [autoFocus]);

  // Grow to fit the whole note, including soft-wrapped lines. WebKit (macOS)
  // doesn't support `field-sizing: content`, so size from scrollHeight instead.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    function fit() {
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    }
    fit();
    const observer = new ResizeObserver(() => fit());
    observer.observe(el.parentElement ?? el);
    return () => observer.disconnect();
  }, [note.text]);

  return (
    <div className="todo-item-notes__note">
      <div className="todo-item-notes__field">
        <textarea
          ref={textareaRef}
          className={`todo-item-notes__textarea${showLinks ? " todo-item__text--behind-links" : ""}`}
          value={note.text}
          rows={1}
          onChange={(e) => onTextChange(e.target.value)}
          onFocus={() => setIsTextFocused(true)}
          onBlur={() => setIsTextFocused(false)}
          onKeyDown={(e) => {
            // Edits are saved as you type; Escape just hands focus back to the
            // item so its notes stay visible.
            if (e.key === "Escape") {
              e.preventDefault();
              onLeave();
            }
          }}
        />
        {/* Same overlay as the item text: only the links take the pointer. */}
        {showLinks && (
          <div className="todo-item-notes__textarea todo-item-notes__text-links">
            {linkify(note.text, "todo-item__link")}
          </div>
        )}
      </div>
      <button
        type="button"
        className="todo-item-notes__delete"
        title="Delete note"
        onClick={onDelete}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
