import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileText, ListChecks, Lock, MoreHorizontal } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { useDocumentStore } from "../../document/documentStore";
import { usePrefsStore } from "../../stores/usePrefsStore";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { findPreviousSibling, type TreeNode } from "../../document/treeUtils";
import { confirmAndDeleteNote } from "../../document/noteActions";

interface NoteTreeItemProps {
  node: TreeNode;
  depth: number;
}

export function NoteTreeItem({ node, depth }: NoteTreeItemProps) {
  const filePath = useDocumentStore((s) => s.filePath);
  const selectedNoteId = useSelectionStore((s) => s.selectedNoteId);
  const pendingRenameId = useSelectionStore((s) => s.pendingRenameId);
  const isExpanded = usePrefsStore((s) =>
    filePath ? s.isExpanded(filePath, node.id) : true,
  );

  const isSelected = selectedNoteId === node.id;
  const hasChildren = node.children.length > 0;
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(node.title);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id, disabled: isEditing });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  useEffect(() => {
    if (pendingRenameId === node.id) {
      setDraftTitle(node.title);
      setIsEditing(true);
      useSelectionStore.getState().clearPendingRename();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRenameId, node.id]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  function commitRename() {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== node.title) {
      useDocumentStore.getState().renameNote(node.id, trimmed);
    }
    setIsEditing(false);
  }

  function toggleExpanded() {
    if (!filePath) return;
    void usePrefsStore.getState().setExpanded(filePath, node.id, !isExpanded);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (isEditing) return;
    if (e.key === "Tab") {
      e.preventDefault();
      const doc = useDocumentStore.getState().doc;
      if (!doc) return;
      if (e.shiftKey) {
        if (node.parentId !== null) {
          const parent = doc.notes.find((n) => n.id === node.parentId);
          useDocumentStore.getState().reparentNote(node.id, parent?.parentId ?? null);
        }
      } else {
        const prevSiblingId = findPreviousSibling(doc.notes, node.id);
        if (prevSiblingId) {
          useDocumentStore.getState().reparentNote(node.id, prevSiblingId);
          if (filePath) void usePrefsStore.getState().setExpanded(filePath, prevSiblingId, true);
        }
      }
    } else if (e.key === "F2") {
      e.preventDefault();
      setDraftTitle(node.title);
      setIsEditing(true);
    } else if (e.key === "Enter") {
      e.preventDefault();
      setDraftTitle(node.title);
      setIsEditing(true);
    }
  }

  const Icon = node.type === "todo" ? ListChecks : FileText;

  async function handleMoreClick(e: React.MouseEvent) {
    e.stopPropagation();
    setIsMenuOpen(true);
    const menu = await Menu.new({
      items: [
        await MenuItem.new({
          text: "Delete",
          action: () => void confirmAndDeleteNote(node.id),
        }),
      ],
    });
    await menu.popup();
    setIsMenuOpen(false);
  }

  return (
    <div className="tree-item" ref={setNodeRef} style={dragStyle}>
      <div
        {...attributes}
        {...listeners}
        className={`tree-item__row${isSelected ? " tree-item__row--selected" : ""}${isMenuOpen ? " tree-item__row--menu-open" : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        tabIndex={0}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
        onClick={() => useSelectionStore.getState().select(node.id)}
        onDoubleClick={() => {
          setDraftTitle(node.title);
          setIsEditing(true);
        }}
        onKeyDown={handleKeyDown}
      >
        <button
          type="button"
          className={`tree-item__chevron${hasChildren ? "" : " tree-item__chevron--hidden"}`}
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded();
          }}
        >
          {hasChildren && (isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </button>
        <Icon size={14} className="tree-item__icon" />
        {isEditing ? (
          <input
            ref={inputRef}
            className="tree-item__rename-input"
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") commitRename();
              else if (e.key === "Escape") {
                setDraftTitle(node.title);
                setIsEditing(false);
              }
            }}
          />
        ) : (
          <span className="tree-item__title">{node.title}</span>
        )}
        {node.isEncrypted && <Lock size={12} className="tree-item__lock" />}
        <button
          type="button"
          className="tree-item__more"
          tabIndex={-1}
          title="More actions"
          onClick={(e) => void handleMoreClick(e)}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
      {hasChildren && isExpanded && (
        <div role="group">
          {node.children.map((child) => (
            <NoteTreeItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
