import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Plus, Trash2, Undo2 } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  parsePasswordGrid,
  serializePasswordGrid,
  type PasswordEntry,
} from "../../document/passwordGrid";
import { usePasswordGridUndoStore } from "../../stores/usePasswordGridUndoStore";

interface PasswordGridEditorProps {
  noteId: string;
  content: string;
  onChange: (content: string) => void;
}

function emptyEntry(): PasswordEntry {
  return { id: crypto.randomUUID(), name: "", username: "", password: "", note: "" };
}

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/** Splits note text into plain text and links that open in the default
 * browser. Trailing punctuation is left out of the link so a URL at the end
 * of a sentence still works. */
function linkify(text: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0].replace(/[.,;:!?)\]}]+$/, "");
    const start = match.index;
    if (start > last) parts.push(text.slice(last, start));
    const href = raw.toLowerCase().startsWith("www.") ? `https://${raw}` : raw;
    parts.push(
      <a
        href={href}
        className="password-grid__note-link"
        // Keep the click from focusing the note view, which would switch it
        // to the textarea before the click lands.
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openUrl(href).catch((err) => console.error("Failed to open URL", err));
        }}
      >
        {raw}
      </a>,
    );
    last = start + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>);
}

/** Grid of name/username/password rows for a "password grid" note, always
 * sorted by name, with a filter box and a bottom pane showing the selected
 * row's note. Uncontrolled like TodoEditor: parses `content` once at mount
 * (the note switches key the whole editor, see NoteEditor) and pushes
 * changes back out via onChange. */
export function PasswordGridEditor({ noteId, content, onChange }: PasswordGridEditorProps) {
  const [doc, setDoc] = useState(() => parsePasswordGrid(content));
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // While a name input has focus, edits are kept here rather than written
  // straight through — otherwise the grid (always sorted by name) would
  // reorder out from under the row on every keystroke.
  const [nameDraft, setNameDraft] = useState<{ id: string; value: string } | null>(null);
  const justFocusedCopyField = useRef(false);
  const nameInputs = useRef(new Map<string, HTMLInputElement>());
  // Set by Add Row so the new row's name input gets focus once it renders.
  const [focusNameId, setFocusNameId] = useState<string | null>(null);
  // Whether the note pane shows the textarea rather than the linkified view.
  const [editingNote, setEditingNote] = useState(false);

  useEffect(() => {
    if (!focusNameId) return;
    nameInputs.current.get(focusNameId)?.focus();
    setFocusNameId(null);
  }, [focusNameId]);

  const deletedCount = usePasswordGridUndoStore(
    (s) => s.deletedByNote[noteId]?.length ?? 0,
  );

  function updateEntries(entries: PasswordEntry[]) {
    setDoc({ entries });
    onChange(serializePasswordGrid({ entries }));
  }

  function updateEntry(id: string, patch: Partial<PasswordEntry>) {
    updateEntries(doc.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function handleAddRow() {
    const entry = emptyEntry();
    updateEntries([...doc.entries, entry]);
    setSelectedId(entry.id);
    // The new, empty row wouldn't match a filter, so clear it.
    setFilter("");
    setFocusNameId(entry.id);
  }

  function handleDeleteRow(id: string) {
    const entry = doc.entries.find((e) => e.id === id);
    if (!entry) return;
    usePasswordGridUndoStore.getState().pushDeleted(noteId, entry);
    updateEntries(doc.entries.filter((e) => e.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function handleUndo() {
    const entry = usePasswordGridUndoStore.getState().popDeleted(noteId);
    if (!entry) return;
    updateEntries([...doc.entries, entry]);
  }

  const sortedEntries = useMemo(
    () => [...doc.entries].sort((a, b) => a.name.localeCompare(b.name)),
    [doc.entries],
  );
  const filteredEntries = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sortedEntries;
    return sortedEntries.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.username.toLowerCase().includes(q) ||
        e.password.toLowerCase().includes(q),
    );
  }, [sortedEntries, filter]);

  const selectedEntry = doc.entries.find((e) => e.id === selectedId) ?? null;

  /** Handlers for the username and password cells: focusing one selects its
   * whole value and copies it to the clipboard. */
  function copyOnFocusProps(label: string) {
    return {
      onFocus: (e: FocusEvent<HTMLInputElement>) => {
        e.target.select();
        if (e.target.value) {
          navigator.clipboard.writeText(e.target.value).catch((err) => {
            console.error(`Failed to copy ${label} to clipboard`, err);
          });
        }
      },
      onMouseDown: (e: MouseEvent<HTMLInputElement>) => {
        justFocusedCopyField.current = document.activeElement !== e.currentTarget;
      },
      onMouseUp: (e: MouseEvent<HTMLInputElement>) => {
        // The mouse click that focused the field can collapse the selection
        // made in onFocus to a caret (WebView2 does this when refocusing an
        // input that had a selection before), so select it again here.
        if (justFocusedCopyField.current) {
          e.preventDefault();
          e.currentTarget.select();
          justFocusedCopyField.current = false;
        }
      },
    };
  }

  return (
    <div className="password-grid">
      <div className="password-grid__toolbar">
        <input
          type="text"
          className="password-grid__filter"
          placeholder="Filter…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button type="button" className="button" onClick={handleAddRow}>
          <Plus size={14} />
          Add Row
        </button>
        <button
          type="button"
          className="button"
          onClick={handleUndo}
          disabled={deletedCount === 0}
          title={deletedCount === 0 ? "Nothing to undo" : `Undo delete (${deletedCount} available)`}
        >
          <Undo2 size={14} />
          Undo Delete
        </button>
      </div>
      <div className="password-grid__table-wrap">
        <table className="password-grid__table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Password</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {filteredEntries.map((entry) => (
              <tr
                key={entry.id}
                className={`password-grid__row${entry.id === selectedId ? " password-grid__row--selected" : ""}`}
                onClick={() => setSelectedId(entry.id)}
                onFocus={() => setSelectedId(entry.id)}
              >
                <td>
                  <input
                    ref={(el) => {
                      if (el) nameInputs.current.set(entry.id, el);
                      else nameInputs.current.delete(entry.id);
                    }}
                    className="password-grid__cell-input"
                    value={nameDraft?.id === entry.id ? nameDraft.value : entry.name}
                    onFocus={() => setNameDraft({ id: entry.id, value: entry.name })}
                    onChange={(e) => setNameDraft({ id: entry.id, value: e.target.value })}
                    onBlur={() => {
                      if (nameDraft?.id === entry.id) {
                        updateEntry(entry.id, { name: nameDraft.value });
                        setNameDraft(null);
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td>
                  <input
                    className="password-grid__cell-input"
                    value={entry.username}
                    onChange={(e) => updateEntry(entry.id, { username: e.target.value })}
                    {...copyOnFocusProps("username")}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td>
                  <input
                    className="password-grid__cell-input"
                    value={entry.password}
                    onChange={(e) => updateEntry(entry.id, { password: e.target.value })}
                    {...copyOnFocusProps("password")}
                    onClick={(e) => e.stopPropagation()}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    className="icon-button"
                    title="Delete row"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRow(entry.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {filteredEntries.length === 0 && (
              <tr className="password-grid__row--empty">
                <td colSpan={4} className="password-grid__empty">
                  {doc.entries.length === 0
                    ? "No entries yet — Add Row to create one."
                    : "No entries match your filter."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="password-grid__note-pane">
        <label className="password-grid__note-label">
          Note{selectedEntry ? ` — ${selectedEntry.name || "Untitled"}` : ""}
        </label>
        {selectedEntry?.note && !editingNote ? (
          // Read view with clickable URLs; clicking or tabbing into it
          // switches to the textarea.
          <div
            className="password-grid__note-view"
            tabIndex={0}
            onFocus={() => setEditingNote(true)}
            onClick={() => setEditingNote(true)}
          >
            {linkify(selectedEntry.note)}
          </div>
        ) : (
          <textarea
            className="password-grid__note-textarea"
            value={selectedEntry?.note ?? ""}
            disabled={!selectedEntry}
            autoFocus={editingNote}
            placeholder={
              selectedEntry ? "Notes for this entry…" : "Select a row to view or edit its note."
            }
            onFocus={() => setEditingNote(true)}
            onBlur={() => setEditingNote(false)}
            onChange={(e) => selectedEntry && updateEntry(selectedEntry.id, { note: e.target.value })}
          />
        )}
      </div>
    </div>
  );
}
