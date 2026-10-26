import { useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  isNonBlankNote,
  parseTodoMarkdown,
  pruneCompletedItems,
  serializeTodoMarkdown,
  sortItemsForDisplay,
  type Priority,
  type SortMode,
  type TodoDoc,
  type TodoItem,
  type TodoNote,
} from "../../document/todoMarkdown";
import { TodoItemRow } from "./TodoItemRow";

interface TodoEditorProps {
  noteId: string;
  content: string;
  onChange: (content: string) => void;
}

/** A user deletion that the Undo link can reverse, with enough position info
 * to put the deleted thing back where it was. */
type Deletion =
  | { kind: "item"; item: TodoItem; index: number }
  | { kind: "note"; itemId: string; note: TodoNote; index: number };

const MAX_UNDO = 20;

/** Per-list undo history, kept in memory only so it survives switching
 * between lists (which remounts the editor) but not an app restart. */
const undoStacksByNoteId = new Map<string, Deletion[]>();

const SORT_MODES: { mode: SortMode; label: string }[] = [
  { mode: "manual", label: "Manual" },
  { mode: "priority", label: "Priority" },
  { mode: "alphabetical", label: "A–Z" },
];

export function TodoEditor({ noteId, content, onChange }: TodoEditorProps) {
  const [doc, setDoc] = useState<TodoDoc>(() => parseTodoMarkdown(content));
  const [draftText, setDraftText] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [undoStack, setUndoStack] = useState<Deletion[]>(
    () => undoStacksByNoteId.get(noteId) ?? [],
  );

  useEffect(() => {
    undoStacksByNoteId.set(noteId, undoStack);
  }, [noteId, undoStack]);

  useEffect(() => {
    if (!pendingScrollId) return;
    const el = listRef.current?.querySelector(`[data-item-id="${pendingScrollId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setPendingScrollId(null);
    }
  }, [pendingScrollId, doc.items]);

  function updateDoc(next: TodoDoc) {
    setDoc(next);
    onChange(serializeTodoMarkdown(next));
  }

  function updateItems(items: TodoItem[]) {
    updateDoc({ ...doc, items });
  }

  function mapItem(itemId: string, fn: (item: TodoItem) => TodoItem) {
    updateItems(doc.items.map((item) => (item.id === itemId ? fn(item) : item)));
  }

  function handleToggleChecked(itemId: string) {
    const now = new Date().toISOString();
    const next = doc.items.map((item) =>
      item.id === itemId
        ? { ...item, checked: !item.checked, completedAt: !item.checked ? now : undefined }
        : item,
    );
    updateItems(pruneCompletedItems(next));
  }

  function pushUndo(deletion: Deletion) {
    setUndoStack((stack) => [...stack, deletion].slice(-MAX_UNDO));
  }

  function handleDeleteItem(itemId: string) {
    const index = doc.items.findIndex((i) => i.id === itemId);
    if (index === -1) return;
    pushUndo({ kind: "item", item: doc.items[index], index });
    updateItems(doc.items.filter((i) => i.id !== itemId));
  }

  function handleDeleteNote(itemId: string, noteId: string) {
    const item = doc.items.find((i) => i.id === itemId);
    const index = item?.notes.findIndex((n) => n.id === noteId) ?? -1;
    if (!item || index === -1) return;
    // Blank notes aren't worth an undo entry.
    if (isNonBlankNote(item.notes[index])) {
      pushUndo({ kind: "note", itemId, note: item.notes[index], index });
    }
    mapItem(itemId, (i) => ({ ...i, notes: i.notes.filter((n) => n.id !== noteId) }));
  }

  function handleUndo() {
    const deletion = undoStack[undoStack.length - 1];
    if (!deletion) return;
    setUndoStack((stack) => stack.slice(0, -1));
    if (deletion.kind === "item") {
      const items = [...doc.items];
      items.splice(Math.min(deletion.index, items.length), 0, deletion.item);
      updateItems(items);
      setPendingScrollId(deletion.item.id);
    } else {
      // If the note's item has since been deleted too, there's nowhere to put it back.
      mapItem(deletion.itemId, (i) => {
        const notes = [...i.notes];
        notes.splice(Math.min(deletion.index, notes.length), 0, deletion.note);
        return { ...i, notes };
      });
      setPendingScrollId(deletion.itemId);
    }
  }

  function handleAddItem() {
    const text = draftText.trim();
    if (!text) return;
    const newItem: TodoItem = {
      id: crypto.randomUUID(),
      text,
      checked: false,
      priority: "none",
      notes: [],
    };
    updateItems([...doc.items, newItem]);
    setDraftText("");
    setPendingScrollId(newItem.id);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = doc.items.findIndex((item) => item.id === active.id);
    const newIndex = doc.items.findIndex((item) => item.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    updateItems(arrayMove(doc.items, oldIndex, newIndex));
  }

  const sortedItems = sortItemsForDisplay(doc.items, doc.sortMode);
  const activeCount = doc.items.length - doc.items.filter((i) => i.checked).length;
  const activeItems = sortedItems.slice(0, activeCount);
  const completedItems = sortedItems.slice(activeCount);
  const dragDisabled = doc.sortMode !== "manual";
  const visibleItems = showCompleted ? [...activeItems, ...completedItems] : activeItems;

  function renderRow(item: TodoItem) {
    return (
      <TodoItemRow
        key={item.id}
        item={item}
        dragDisabled={dragDisabled || item.checked}
        onToggleChecked={() => handleToggleChecked(item.id)}
        onTextChange={(text) => mapItem(item.id, (i) => ({ ...i, text }))}
        onPriorityChange={(priority: Priority) =>
          mapItem(item.id, (i) => ({ ...i, priority }))
        }
        onDelete={() => handleDeleteItem(item.id)}
        onAddNote={() =>
          mapItem(item.id, (i) => ({
            ...i,
            notes: [...i.notes, { id: crypto.randomUUID(), text: "" }],
          }))
        }
        onNoteTextChange={(noteId, text) =>
          mapItem(item.id, (i) => ({
            ...i,
            notes: i.notes.map((n) => (n.id === noteId ? { ...n, text } : n)),
          }))
        }
        onNoteDelete={(noteId) => handleDeleteNote(item.id, noteId)}
        onDiscardBlankNotes={() =>
          mapItem(item.id, (i) => ({ ...i, notes: i.notes.filter(isNonBlankNote) }))
        }
      />
    );
  }

  return (
    <div className="todo-editor">
      <div className="todo-editor__header">
        {undoStack.length > 0 && (
          <button
            type="button"
            className="todo-editor__undo"
            title={
              undoStack[undoStack.length - 1].kind === "item"
                ? "Restore the last deleted task"
                : "Restore the last deleted note"
            }
            onClick={handleUndo}
          >
            Undo
          </button>
        )}
        <div className="todo-editor__sort-toggle">
          {SORT_MODES.map(({ mode, label }) => (
            <button
              key={mode}
              type="button"
              className={`todo-editor__sort-option${doc.sortMode === mode ? " todo-editor__sort-option--active" : ""}`}
              onClick={() => updateDoc({ ...doc, sortMode: mode })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="todo-editor__list" ref={listRef}>
        {doc.items.length === 0 ? (
          <p className="todo-editor__empty">No tasks yet — add one below.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visibleItems.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              {activeItems.map(renderRow)}
              {completedItems.length > 0 && (
                <button
                  type="button"
                  className="todo-editor__completed-toggle"
                  onClick={() => setShowCompleted((v) => !v)}
                >
                  {showCompleted ? "Hide" : "Show"} completed ({completedItems.length})
                </button>
              )}
              {showCompleted && completedItems.map(renderRow)}
            </SortableContext>
          </DndContext>
        )}
      </div>
      <div className="todo-editor__add-row">
        <input
          type="text"
          className="todo-editor__add-input"
          placeholder="Add a task…"
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddItem();
            } else if (e.key === "Escape") {
              setDraftText("");
            }
          }}
        />
        {draftText && (
          <button
            type="button"
            className="todo-editor__add-cancel"
            title="Clear"
            onClick={() => setDraftText("")}
          >
            <X size={14} />
          </button>
        )}
        <button
          type="button"
          className="todo-editor__add-button"
          title="Add task"
          disabled={!draftText.trim()}
          onClick={handleAddItem}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
