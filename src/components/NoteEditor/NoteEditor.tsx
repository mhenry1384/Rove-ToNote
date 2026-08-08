import { useDocumentStore } from "../../document/documentStore";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { MarkdownEditor } from "./MarkdownEditor";
import { noteColorBg } from "../../document/noteColors";

/**
 * Todo-list notes still use a plain textarea until the real Todoist-style
 * editor is wired in; markdown notes get the WYSIWYG Milkdown/Crepe editor.
 */
export function NoteEditor() {
  const selectedNoteId = useSelectionStore((s) => s.selectedNoteId);
  const note = useDocumentStore((s) =>
    s.doc?.notes.find((n) => n.id === selectedNoteId),
  );

  if (!note) {
    return (
      <div className="note-editor note-editor--empty">
        <p>Select a note on the left, or create a new one.</p>
      </div>
    );
  }

  const colorBg = noteColorBg(note.color);

  return (
    <div
      className={`note-editor${colorBg ? " note-editor--colored" : ""}`}
      key={note.id}
      style={colorBg ? { background: colorBg, color: "#fff" } : undefined}
    >
      <h2 className="note-editor__title">{note.title}</h2>
      {note.type === "markdown" ? (
        <MarkdownEditor
          noteId={note.id}
          defaultValue={note.content}
          onChange={(content) =>
            useDocumentStore.getState().setNoteContent(note.id, content)
          }
        />
      ) : (
        <textarea
          className="note-editor__textarea"
          value={note.content}
          placeholder="(To-do list editor coming soon — raw markdown for now)"
          onChange={(e) =>
            useDocumentStore
              .getState()
              .setNoteContent(note.id, e.target.value)
          }
        />
      )}
    </div>
  );
}
