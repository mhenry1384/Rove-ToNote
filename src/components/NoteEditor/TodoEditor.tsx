import { useState } from "react";
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

  const displayItems = sortItemsForDisplay(doc.items, doc.sortMode);
  const dragDisabled = doc.sortMode !== "manual";

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
        {displayItems.length === 0 ? (
          <p className="todo-editor__empty">No tasks yet — add one below.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={displayItems.map((item) => item.id)}
              strategy={verticalListSortingStrategy}
            >
              {displayItems.map((item) => (
                <TodoItemRow
                  key={item.id}
                  item={item}
                  dragDisabled={dragDisabled}
                  onToggleChecked={() =>
                    mapItem(item.id, (i) => ({ ...i, checked: !i.checked }))
                  }
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
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
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
    </div>
  );
}
