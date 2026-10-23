import { useEffect, useRef, useState } from "react";
import { Flag, GripVertical, MessageSquare, Trash2 } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Priority, TodoItem } from "../../document/todoMarkdown";
import { PRIORITY_COLORS, PRIORITY_ORDER } from "../../document/priorityColors";
import { TodoItemNotes } from "./TodoItemNotes";

interface TodoItemRowProps {
  item: TodoItem;
  dragDisabled: boolean;
  onToggleChecked: () => void;
  onTextChange: (text: string) => void;
  onPriorityChange: (priority: Priority) => void;
  onDelete: () => void;
  onAddNote: () => void;
  onNoteTextChange: (noteId: string, text: string) => void;
  onNoteDelete: (noteId: string) => void;
}

export function TodoItemRow({
  item,
  dragDisabled,
  onToggleChecked,
  onTextChange,
  onPriorityChange,
  onDelete,
  onAddNote,
  onNoteTextChange,
  onNoteDelete,
}: TodoItemRowProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(false);
  const [pendingFocusNoteId, setPendingFocusNoteId] = useState<string | null>(null);
  const addNoteRequestedRef = useRef(false);
  const priorityButtonRef = useRef<HTMLButtonElement>(null);
  const priorityMenuRef = useRef<HTMLDivElement>(null);
  const [priorityMenuPos, setPriorityMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: dragDisabled,
  });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  useEffect(() => {
    if (!priorityMenuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (priorityMenuRef.current?.contains(e.target as Node)) return;
      if (priorityButtonRef.current?.contains(e.target as Node)) return;
      setPriorityMenuOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setPriorityMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [priorityMenuOpen]);

  function handlePriorityClick() {
    const rect = priorityButtonRef.current?.getBoundingClientRect();
    if (rect) setPriorityMenuPos({ top: rect.bottom + 4, left: rect.left });
    setPriorityMenuOpen((open) => !open);
  }

  function handlePickPriority(priority: Priority) {
    onPriorityChange(priority);
    setPriorityMenuOpen(false);
  }

  function handleAddNote() {
    if (hasBlankNote) return;
    addNoteRequestedRef.current = true;
    onAddNote();
  }

  function handleContainerFocus(e: React.FocusEvent<HTMLDivElement>) {
    // Checking the box removes the item, so don't flash the notes panel open first.
    if ((e.target as HTMLElement).classList.contains("todo-item__checkbox")) return;
    setIsFocused(true);
  }

  function handleContainerBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setIsFocused(false);
    }
  }

  useEffect(() => {
    if (addNoteRequestedRef.current && item.notes.length > 0) {
      addNoteRequestedRef.current = false;
      setPendingFocusNoteId(item.notes[item.notes.length - 1].id);
    }
  }, [item.notes]);

  const priorityColor = PRIORITY_COLORS[item.priority].color;
  const hasBlankNote = item.notes.some((n) => n.text.trim().length === 0);

  return (
    <div
      className="todo-item"
      ref={setNodeRef}
      style={dragStyle}
      data-item-id={item.id}
      onFocus={handleContainerFocus}
      onBlur={handleContainerBlur}
    >
      <div className={`todo-item__row${item.checked ? " todo-item--checked" : ""}`}>
        <button
          type="button"
          className="todo-item__handle"
          title="Drag to reorder"
          {...attributes}
          {...listeners}
          tabIndex={-1}
        >
          <GripVertical size={14} />
        </button>
        <input
          type="checkbox"
          className="todo-item__checkbox"
          checked={item.checked}
          onChange={onToggleChecked}
        />
        <textarea
          className="todo-item__text"
          rows={1}
          value={item.text}
          onChange={(e) => onTextChange(e.target.value.replace(/[\r\n]+/g, " "))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          placeholder="Task"
        />
        <button
          ref={priorityButtonRef}
          type="button"
          className="todo-item__priority"
          title={`Priority: ${PRIORITY_COLORS[item.priority].label}`}
          style={{ color: priorityColor }}
          onClick={handlePriorityClick}
        >
          <Flag size={14} fill={item.priority === "none" ? "none" : priorityColor} />
        </button>
        {item.notes.length > 0 && (
          <span
            className="todo-item__notes-indicator"
            title={`${item.notes.length} note${item.notes.length === 1 ? "" : "s"}`}
          >
            <MessageSquare size={14} />
            <span>{item.notes.length}</span>
          </span>
        )}
        <button
          type="button"
          className="todo-item__delete"
          title="Delete task"
          onClick={onDelete}
        >
          <Trash2 size={14} />
        </button>
      </div>
      {priorityMenuOpen && priorityMenuPos && (
        <div
          ref={priorityMenuRef}
          className="note-menu"
          style={{ top: priorityMenuPos.top, left: priorityMenuPos.left }}
        >
          {PRIORITY_ORDER.map((priority) => (
            <button
              key={priority}
              type="button"
              className="note-menu__item"
              onClick={() => handlePickPriority(priority)}
            >
              <Flag
                size={14}
                style={{ color: PRIORITY_COLORS[priority].color }}
                fill={priority === "none" ? "none" : PRIORITY_COLORS[priority].color}
              />
              {PRIORITY_COLORS[priority].label}
            </button>
          ))}
        </div>
      )}
      {isFocused && (
        <TodoItemNotes
          notes={item.notes}
          focusNoteId={pendingFocusNoteId}
          canAddNote={!hasBlankNote}
          onAddNote={handleAddNote}
          onNoteTextChange={onNoteTextChange}
          onNoteDelete={onNoteDelete}
        />
      )}
    </div>
  );
}
