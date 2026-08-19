import { useState } from "react";
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
  parseTodoMarkdown,
  pruneCompletedItems,
  serializeTodoMarkdown,
  sortItemsForDisplay,
  type Priority,
  type SortMode,
  type TodoDoc,
  type TodoItem,
} from "../../document/todoMarkdown";
import { TodoItemRow } from "./TodoItemRow";

interface TodoEditorProps {
  content: string;
  onChange: (content: string) => void;
}

const SORT_MODES: { mode: SortMode; label: string }[] = [
  { mode: "manual", label: "Manual" },
  { mode: "priority", label: "Priority" },
  { mode: "alphabetical", label: "A–Z" },
];

export function TodoEditor({ content, onChange }: TodoEditorProps) {
  const [doc, setDoc] = useState<TodoDoc>(() => parseTodoMarkdown(content));
  const [draftText, setDraftText] = useState("");
  const [showCompleted, setShowCompleted] = useState(false);

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
        onDelete={() => updateItems(doc.items.filter((i) => i.id !== item.id))}
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
        onNoteDelete={(noteId) =>
          mapItem(item.id, (i) => ({
            ...i,
            notes: i.notes.filter((n) => n.id !== noteId),
          }))
        }
      />
    );
  }

  return (
    <div className="todo-editor">
      <div className="todo-editor__header">
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
      <div className="todo-editor__list">
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
