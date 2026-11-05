import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, KeyRound, ListChecks, Lock, MoreHorizontal } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDocumentStore } from "../../document/documentStore";
import { usePrefsStore } from "../../stores/usePrefsStore";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { useVaultStore } from "../../stores/useVaultStore";
import { useDragPreviewStore } from "../../stores/useDragPreviewStore";
import { docKey } from "../../document/documentSource";
import { findPreviousSibling, type TreeNode } from "../../document/treeUtils";
import { parseTodoMarkdown } from "../../document/todoMarkdown";
import { decryptString, parseEnvelope } from "../../document/crypto/vaultCrypto";
import { noteColorBg } from "../../document/noteColors";
import { showNoteContextMenu } from "./noteContextMenu";
import { BackgroundImageModal } from "./BackgroundImageModal";

interface NoteTreeItemProps {
  node: TreeNode;
  depth: number;
  /** True while a tree filter is active: forces this row's children open
   * (the tree has already been pruned to matches, so there's nothing to
   * hide) and disables drag-reordering, since the visible sibling order
   * during a filter doesn't reflect the real, unfiltered one. */
  isFiltering?: boolean;
}

export function NoteTreeItem({ node, depth, isFiltering = false }: NoteTreeItemProps) {
  const source = useDocumentStore((s) => s.source);
  const key = source ? docKey(source) : null;
  const notes = useDocumentStore((s) => s.doc?.notes);
  const selectedNoteId = useSelectionStore((s) => s.selectedNoteId);
  const pendingRenameId = useSelectionStore((s) => s.pendingRenameId);
  const storedExpanded = usePrefsStore((s) =>
    key ? s.isExpanded(key, node.id) : true,
  );
  const isExpanded = isFiltering || storedExpanded;

  const isSelected = selectedNoteId === node.id;
  const hasChildren = node.children.length > 0;
  const prevSiblingId = findPreviousSibling(notes ?? [], node.id);
  // Only folders may have children — indenting under a non-folder sibling is disallowed.
  const canIndent = !!prevSiblingId && notes?.find((n) => n.id === prevSiblingId)?.type === "folder";
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(node.title);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);

  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const vaultKey = useVaultStore((s) => s.key);
  const [encryptedUncompletedCount, setEncryptedUncompletedCount] = useState<number | null>(null);

  // Encrypted to-do lists show the same "(n)" uncompleted-item count as
  // unencrypted ones, but only once the vault is unlocked — decrypting just
  // for the count, without opening the note.
  useEffect(() => {
    if (node.type !== "todo" || !node.isEncrypted || !isUnlocked || !vaultKey) {
      setEncryptedUncompletedCount(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const plaintext = await decryptString(vaultKey, parseEnvelope(node.content));
        if (!cancelled) {
          setEncryptedUncompletedCount(
            parseTodoMarkdown(plaintext).items.filter((i) => !i.checked).length,
          );
        }
      } catch {
        if (!cancelled) setEncryptedUncompletedCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [node.id, node.type, node.isEncrypted, node.content, isUnlocked, vaultKey]);

  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id, disabled: isEditing || isFiltering });
  const dragStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    position: isDragging ? "relative" : undefined,
    zIndex: isDragging ? 10 : undefined,
  };

  // Where an in-progress drag would land relative to this row (see
  // TreeView's drag handlers + useDragPreviewStore) — "below"/"above" draws
  // a line at this row's edge; "inside" means this row (a folder with no
  // other visible children) would adopt the dragged note as its first
  // child. A plain string return keeps this row from re-rendering on every
  // pointer move unless its own indicator actually changes.
  const dropIndicator = useDragPreviewStore((s): "none" | "below" | "above" | "inside" => {
    if (!s.move || s.activeId === node.id) return "none";
    if (s.move.beforeId === node.id) return "below";
    if (s.move.beforeId === null && s.move.afterId === node.id) return "above";
    if (
      s.move.newParentId === node.id &&
      s.move.beforeId === null &&
      s.move.afterId === null
    ) {
      return "inside";
    }
    return "none";
  });

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
    void usePrefsStore.getState().setExpanded(key, node.id, !storedExpanded);
  }

  function indent() {
    const doc = useDocumentStore.getState().doc;
    if (!doc) return;
    const prevSiblingId = findPreviousSibling(doc.notes, node.id);
    // Only folders may have children.
    if (prevSiblingId && doc.notes.find((n) => n.id === prevSiblingId)?.type === "folder") {
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
    } else if (e.key === "F2" || e.key === "Enter") {
      e.preventDefault();
      startRename();
    }
  }

  const Icon =
    node.type === "todo"
      ? ListChecks
      : node.type === "folder"
        ? Folder
        : node.type === "password-grid"
          ? KeyRound
          : FileText;
  const colorBg = noteColorBg(node.color);
  const uncompletedCount =
    node.type === "todo"
      ? node.isEncrypted
        ? encryptedUncompletedCount
        : parseTodoMarkdown(node.content).items.filter((i) => !i.checked).length
      : null;

  function startRename() {
    setDraftTitle(node.title);
    setIsEditing(true);
  }

  function openMenu(at?: { x: number; y: number }) {
    setIsMenuOpen(true);
    showNoteContextMenu({
      node,
      canIndent,
      onRename: startRename,
      onIndent: indent,
      onOutdent: outdent,
      onEditBackgroundImage: () => setIsImageModalOpen(true),
      at,
    })
      .catch((err) => console.error("Failed to show note menu", err))
      .finally(() => setIsMenuOpen(false));
  }

  function handleMoreClick(e: React.MouseEvent) {
    e.stopPropagation();
    const rect = moreButtonRef.current?.getBoundingClientRect();
    openMenu(rect ? { x: rect.left, y: rect.bottom + 4 } : undefined);
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (isEditing) return;
    openMenu();
  }

  return (
    <div className={`tree-item${isDragging ? " tree-item--dragging" : ""}`} ref={setNodeRef} style={dragStyle}>
      <div
        {...attributes}
        {...listeners}
        className={`tree-item__row${isSelected ? " tree-item__row--selected" : ""}${isMenuOpen ? " tree-item__row--menu-open" : ""}${dropIndicator !== "none" ? ` tree-item__row--drop-${dropIndicator}` : ""}`}
        style={{ paddingLeft: 4 + depth * 14 }}
        tabIndex={0}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
        onClick={() => useSelectionStore.getState().select(node.id)}
        onDoubleClick={startRename}
        onContextMenu={handleContextMenu}
        onKeyDown={handleKeyDown}
      >
        {(colorBg || node.backgroundImageUrl) && (
          <div
            className="tree-item__color-stripe"
            style={{ width: 4 + depth * 14, background: colorBg ?? "var(--accent)" }}
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
        {uncompletedCount !== null && (
          <span className="tree-item__count">({uncompletedCount})</span>
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
      {isImageModalOpen && (
        <BackgroundImageModal noteId={node.id} onClose={() => setIsImageModalOpen(false)} />
      )}
      {hasChildren && isExpanded && (
        <div role="group">
          {node.children.map((child) => (
            <NoteTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              isFiltering={isFiltering}
            />
          ))}
        </div>
      )}
    </div>
  );
}
