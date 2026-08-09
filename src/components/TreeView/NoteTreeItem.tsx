import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileText, ListChecks, ListIndentDecrease, ListIndentIncrease, Lock, MoreHorizontal, Trash2, Unlock } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDocumentStore } from "../../document/documentStore";
import { usePrefsStore } from "../../stores/usePrefsStore";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { docKey } from "../../document/documentSource";
import { findPreviousSibling, type TreeNode } from "../../document/treeUtils";
import { deleteNoteWithUndo, decryptNote, encryptNote } from "../../document/noteActions";
import { NOTE_COLORS, noteColorBg } from "../../document/noteColors";

interface NoteTreeItemProps {
  node: TreeNode;
  depth: number;
}

export function NoteTreeItem({ node, depth }: NoteTreeItemProps) {
  const source = useDocumentStore((s) => s.source);
  const key = source ? docKey(source) : null;
  const notes = useDocumentStore((s) => s.doc?.notes);
  const selectedNoteId = useSelectionStore((s) => s.selectedNoteId);
  const pendingRenameId = useSelectionStore((s) => s.pendingRenameId);
  const isExpanded = usePrefsStore((s) =>
    key ? s.isExpanded(key, node.id) : true,
  );

  const isSelected = selectedNoteId === node.id;
  const hasChildren = node.children.length > 0;
  const canIndent = !!findPreviousSibling(notes ?? [], node.id);
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(node.title);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    if (!key) return;
    void usePrefsStore.getState().setExpanded(key, node.id, !isExpanded);
  }

  function indent() {
    const doc = useDocumentStore.getState().doc;
    if (!doc) return;
    const prevSiblingId = findPreviousSibling(doc.notes, node.id);
    if (prevSiblingId) {
      useDocumentStore.getState().reparentNote(node.id, prevSiblingId);
      if (key) void usePrefsStore.getState().setExpanded(key, prevSiblingId, true);
    }
  }

  function outdent() {
    const doc = useDocumentStore.getState().doc;
    if (!doc || node.parentId === null) return;
    const parent = doc.notes.find((n) => n.id === node.parentId);
    useDocumentStore.getState().reparentNote(node.id, parent?.parentId ?? null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (isEditing) return;
    if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) outdent();
      else indent();
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

  useEffect(() => {
    if (!isMenuOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (moreButtonRef.current?.contains(e.target as Node)) return;
      setIsMenuOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMenuOpen]);

  const Icon = node.type === "todo" ? ListChecks : FileText;
  const colorBg = noteColorBg(node.color);

  function handleMoreClick(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = moreButtonRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.left });
    setIsMenuOpen((open) => !open);
  }

  function handlePickColor(colorId: string | null) {
    useDocumentStore.getState().setNoteColor(node.id, colorId);
    setIsMenuOpen(false);
  }

  function handleToggleEncryption() {
    setIsMenuOpen(false);
    if (node.isEncrypted) void decryptNote(node.id);
    else void encryptNote(node.id);
  }

  return (
    <div className="tree-item" ref={setNodeRef} style={dragStyle}>
      <div
        {...attributes}
        {...listeners}
        className={`tree-item__row${isSelected ? " tree-item__row--selected" : ""}${isMenuOpen ? " tree-item__row--menu-open" : ""}`}
        style={{ paddingLeft: 4 + depth * 14 }}
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
        {colorBg && (
          <div
            className="tree-item__color-stripe"
            style={{ width: 4 + depth * 14, background: colorBg }}
          />
        )}
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
          ref={moreButtonRef}
          type="button"
          className="tree-item__more"
          tabIndex={-1}
          title="More actions"
          onClick={handleMoreClick}
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
      {isMenuOpen && menuPos && (
        <div
          ref={menuRef}
          className="note-menu"
          style={{ top: menuPos.top, left: menuPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="note-menu__item"
            onClick={() => {
              setIsMenuOpen(false);
              deleteNoteWithUndo(node.id);
            }}
          >
            <Trash2 size={14} />
            Delete
          </button>
          <button type="button" className="note-menu__item" onClick={handleToggleEncryption}>
            {node.isEncrypted ? <Unlock size={14} /> : <Lock size={14} />}
            {node.isEncrypted ? "Decrypt" : "Encrypt"}
          </button>
          {(canIndent || node.parentId !== null) && (
            <>
              <div className="note-menu__divider" />
              {canIndent && (
                <button
                  type="button"
                  className="note-menu__item"
                  onClick={() => {
                    setIsMenuOpen(false);
                    indent();
                  }}
                >
                  <ListIndentIncrease size={14} />
                  Indent (make sub-item)
                </button>
              )}
              {node.parentId !== null && (
                <button
                  type="button"
                  className="note-menu__item"
                  onClick={() => {
                    setIsMenuOpen(false);
                    outdent();
                  }}
                >
                  <ListIndentDecrease size={14} />
                  Outdent
                </button>
              )}
            </>
          )}
          <div className="note-menu__divider" />
          <div className="note-menu__label">Background color</div>
          <div className="note-menu__swatches">
            <button
              type="button"
              className={`note-color-swatch note-color-swatch--none${!node.color ? " note-color-swatch--selected" : ""}`}
              title="Default"
              onClick={() => handlePickColor(null)}
            />
            {NOTE_COLORS.map((color) => (
              <button
                key={color.id}
                type="button"
                className={`note-color-swatch${node.color === color.id ? " note-color-swatch--selected" : ""}`}
                style={{ background: color.bg }}
                title={color.label}
                onClick={() => handlePickColor(color.id)}
              />
            ))}
          </div>
        </div>
      )}
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
