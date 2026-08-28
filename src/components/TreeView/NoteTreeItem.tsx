import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, KeyRound, ListChecks, ListIndentDecrease, ListIndentIncrease, Lock, MoreHorizontal, Trash2, Unlock } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDocumentStore } from "../../document/documentStore";
import { usePrefsStore } from "../../stores/usePrefsStore";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { useVaultStore } from "../../stores/useVaultStore";
import { useDragPreviewStore } from "../../stores/useDragPreviewStore";
import { docKey } from "../../document/documentSource";
import { findPreviousSibling, folderEncryptionState, type TreeNode } from "../../document/treeUtils";
import {
  deleteNoteWithUndo,
  decryptNote,
  encryptNote,
  decryptAllInFolder,
  encryptAllInFolder,
} from "../../document/noteActions";
import { parseTodoMarkdown } from "../../document/todoMarkdown";
import { decryptString, parseEnvelope } from "../../document/crypto/vaultCrypto";
import { NOTE_COLORS, noteColorBg, DEFAULT_BACKGROUND_IMAGE_OPACITY } from "../../document/noteColors";

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
  const recentBackgroundImageUrls = usePrefsStore((s) => s.prefs.recentBackgroundImageUrls);
  const isExpanded = isFiltering || storedExpanded;

  const isSelected = selectedNoteId === node.id;
  const hasChildren = node.children.length > 0;
  const prevSiblingId = findPreviousSibling(notes ?? [], node.id);
  // Only folders may have children — indenting under a non-folder sibling is disallowed.
  const canIndent = !!prevSiblingId && notes?.find((n) => n.id === prevSiblingId)?.type === "folder";
  const canDelete = node.type !== "folder" || node.children.length === 0;
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(node.title);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [imageUrlDraft, setImageUrlDraft] = useState(node.backgroundImageUrl ?? "");
  const [isRecentUrlsOpen, setIsRecentUrlsOpen] = useState(false);
  const [hoveredRecentUrl, setHoveredRecentUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const recentUrlsRef = useRef<HTMLDivElement>(null);
  const recentUrlsToggleRef = useRef<HTMLButtonElement>(null);

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
    if (isMenuOpen) {
      setImageUrlDraft(node.backgroundImageUrl ?? "");
    } else {
      setIsRecentUrlsOpen(false);
      setHoveredRecentUrl(null);
    }
  }, [isMenuOpen, node.backgroundImageUrl]);

  useEffect(() => {
    if (!isRecentUrlsOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (recentUrlsRef.current?.contains(e.target as Node)) return;
      if (recentUrlsToggleRef.current?.contains(e.target as Node)) return;
      setIsRecentUrlsOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsRecentUrlsOpen(false);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && hoveredRecentUrl) {
        e.preventDefault();
        void usePrefsStore.getState().removeRecentBackgroundImageUrl(hoveredRecentUrl);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isRecentUrlsOpen, hoveredRecentUrl]);

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

  function commitImageUrl() {
    const trimmed = imageUrlDraft.trim();
    if (trimmed === (node.backgroundImageUrl ?? "")) return;
    useDocumentStore.getState().setNoteBackgroundImage(node.id, trimmed || null);
    if (trimmed) {
      // Only remember URLs that actually resolve to an image — a typo or a
      // dead link shouldn't clutter the recent-URLs list.
      const probe = new Image();
      probe.onload = () => {
        void usePrefsStore.getState().addRecentBackgroundImageUrl(trimmed);
      };
      probe.src = trimmed;
    }
  }

  function handlePickRecentUrl(url: string) {
    setImageUrlDraft(url);
    useDocumentStore.getState().setNoteBackgroundImage(node.id, url);
    setIsRecentUrlsOpen(false);
  }

  function handleOpacityChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!node.backgroundImageUrl) return;
    useDocumentStore
      .getState()
      .setNoteBackgroundImage(node.id, node.backgroundImageUrl, Number(e.target.value) / 100);
  }

  function handleRemoveImage() {
    setImageUrlDraft("");
    useDocumentStore.getState().setNoteBackgroundImage(node.id, null);
  }

  function handleToggleEncryption() {
    setIsMenuOpen(false);
    if (node.isEncrypted) void decryptNote(node.id);
    else void encryptNote(node.id);
  }

  const folderEncryption =
    node.type === "folder" ? folderEncryptionState(notes ?? [], node.id) : null;

  function handleEncryptAll() {
    setIsMenuOpen(false);
    void encryptAllInFolder(node.id);
  }

  function handleDecryptAll() {
    setIsMenuOpen(false);
    void decryptAllInFolder(node.id);
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
        onDoubleClick={() => {
          setDraftTitle(node.title);
          setIsEditing(true);
        }}
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
      {isMenuOpen && menuPos && (
        <div
          ref={menuRef}
          className="note-menu"
          style={{ top: menuPos.top, left: menuPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          {canDelete && (
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
          )}
          {node.type !== "folder" && (
            <button type="button" className="note-menu__item" onClick={handleToggleEncryption}>
              {node.isEncrypted ? <Unlock size={14} /> : <Lock size={14} />}
              {node.isEncrypted ? "Decrypt" : "Encrypt"}
            </button>
          )}
          {folderEncryption?.hasEncrypted && (
            <button type="button" className="note-menu__item" onClick={handleDecryptAll}>
              <Unlock size={14} />
              Decrypt All
            </button>
          )}
          {folderEncryption?.hasUnencrypted && (
            <button type="button" className="note-menu__item" onClick={handleEncryptAll}>
              <Lock size={14} />
              Encrypt All
            </button>
          )}
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
          <div className="note-menu__divider" />
          <div className="note-menu__label">Background image</div>
          <div className="note-menu__image-url-row">
            <input
              type="url"
              className="note-menu__image-input"
              placeholder="Image URL"
              value={imageUrlDraft}
              onChange={(e) => setImageUrlDraft(e.target.value)}
              onBlur={commitImageUrl}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                else if (e.key === "Escape") setImageUrlDraft(node.backgroundImageUrl ?? "");
              }}
            />
            {recentBackgroundImageUrls.length > 0 && (
              <button
                type="button"
                ref={recentUrlsToggleRef}
                className="note-menu__image-url-toggle"
                title="Recent image URLs"
                onClick={() => setIsRecentUrlsOpen((open) => !open)}
              >
                <ChevronDown size={14} />
              </button>
            )}
          </div>
          {isRecentUrlsOpen && (
            <div className="note-menu__recent-urls" ref={recentUrlsRef}>
              {recentBackgroundImageUrls.map((url) => (
                <div
                  key={url}
                  className="note-menu__recent-url"
                  onMouseEnter={() => setHoveredRecentUrl(url)}
                  onMouseLeave={() =>
                    setHoveredRecentUrl((cur) => (cur === url ? null : cur))
                  }
                  onClick={() => handlePickRecentUrl(url)}
                  title={`${url}\n(hover and press Delete to remove)`}
                >
                  {url}
                </div>
              ))}
            </div>
          )}
          {node.backgroundImageUrl && (
            <div className="note-menu__image-opacity">
              <input
                type="range"
                min={10}
                max={100}
                value={Math.round(
                  (node.backgroundImageOpacity ?? DEFAULT_BACKGROUND_IMAGE_OPACITY) * 100,
                )}
                onChange={handleOpacityChange}
              />
              <button type="button" className="note-menu__item" onClick={handleRemoveImage}>
                Remove image
              </button>
            </div>
          )}
        </div>
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
