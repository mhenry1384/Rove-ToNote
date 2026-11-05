import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useDocumentStore } from "../../document/documentStore";
import { usePrefsStore } from "../../stores/usePrefsStore";
import { DEFAULT_BACKGROUND_IMAGE_OPACITY } from "../../document/noteColors";

interface BackgroundImageModalProps {
  noteId: string;
  onClose: () => void;
}

/** Background image URL + opacity for a note, opened from the tree row's
 * native context menu (which can't host a text field or slider). Changes
 * apply live; closing just dismisses. */
export function BackgroundImageModal({ noteId, onClose }: BackgroundImageModalProps) {
  const note = useDocumentStore((s) => s.doc?.notes.find((n) => n.id === noteId));
  const recentBackgroundImageUrls = usePrefsStore((s) => s.prefs.recentBackgroundImageUrls);
  // What the note had when the dialog opened, restored on Cancel/Escape.
  const [original] = useState(() => ({
    url: note?.backgroundImageUrl ?? null,
    opacity: note?.backgroundImageOpacity ?? null,
    // Setting an image clears the note's color, so Cancel restores it too.
    color: note?.color ?? null,
  }));
  const [imageUrlDraft, setImageUrlDraft] = useState(note?.backgroundImageUrl ?? "");
  const [isRecentUrlsOpen, setIsRecentUrlsOpen] = useState(false);
  const [hoveredRecentUrl, setHoveredRecentUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recentUrlsRef = useRef<HTMLDivElement>(null);
  const recentUrlsToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (!isRecentUrlsOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (recentUrlsRef.current?.contains(e.target as Node)) return;
      if (recentUrlsToggleRef.current?.contains(e.target as Node)) return;
      setIsRecentUrlsOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setIsRecentUrlsOpen(false);
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && hoveredRecentUrl) {
        e.preventDefault();
        void usePrefsStore.getState().removeRecentBackgroundImageUrl(hoveredRecentUrl);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isRecentUrlsOpen, hoveredRecentUrl]);

  if (!note) return null;

  function commitImageUrl() {
    const trimmed = imageUrlDraft.trim();
    if (trimmed === (note?.backgroundImageUrl ?? "")) return;
    useDocumentStore.getState().setNoteBackgroundImage(noteId, trimmed || null);
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

  function close() {
    commitImageUrl();
    onClose();
  }

  function cancel() {
    const current = useDocumentStore.getState().doc?.notes.find((n) => n.id === noteId);
    if (
      current &&
      ((current.backgroundImageUrl ?? null) !== original.url ||
        (current.backgroundImageOpacity ?? null) !== original.opacity ||
        (current.color ?? null) !== original.color)
    ) {
      const store = useDocumentStore.getState();
      if (original.url) {
        store.setNoteBackgroundImage(
          noteId,
          original.url,
          original.opacity ?? DEFAULT_BACKGROUND_IMAGE_OPACITY,
        );
      } else {
        store.setNoteColor(noteId, original.color);
      }
    }
    onClose();
  }

  function handlePickRecentUrl(url: string) {
    setImageUrlDraft(url);
    useDocumentStore.getState().setNoteBackgroundImage(noteId, url);
    setIsRecentUrlsOpen(false);
  }

  function handleOpacityChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!note?.backgroundImageUrl) return;
    useDocumentStore
      .getState()
      .setNoteBackgroundImage(noteId, note.backgroundImageUrl, Number(e.target.value) / 100);
  }

  function handleRemoveImage() {
    setImageUrlDraft("");
    useDocumentStore.getState().setNoteBackgroundImage(noteId, null);
  }

  return createPortal(
    // React events bubble out of portals along the component tree, so keep
    // them from reaching the tree row (selection, drag, rename shortcuts).
    <div
      className="vault-modal-backdrop"
      onMouseDown={close}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") cancel();
      }}
    >
      <div
        className="vault-modal background-image-modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 className="vault-modal__title">Background image — {note.title}</h3>
        <div className="note-menu__image-url-row">
          <input
            ref={inputRef}
            type="url"
            className="note-menu__image-input"
            placeholder="Image URL"
            value={imageUrlDraft}
            onChange={(e) => setImageUrlDraft(e.target.value)}
            onBlur={commitImageUrl}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitImageUrl();
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
                onMouseLeave={() => setHoveredRecentUrl((cur) => (cur === url ? null : cur))}
                onClick={() => handlePickRecentUrl(url)}
                title={`${url}\n(hover and press Delete to remove)`}
              >
                {url}
              </div>
            ))}
          </div>
        )}
        {note.backgroundImageUrl && (
          <div className="note-menu__image-opacity">
            <span className="vault-modal__hint">Opacity</span>
            <input
              type="range"
              min={10}
              max={100}
              value={Math.round(
                (note.backgroundImageOpacity ?? DEFAULT_BACKGROUND_IMAGE_OPACITY) * 100,
              )}
              onChange={handleOpacityChange}
            />
            <button type="button" className="note-menu__item" onClick={handleRemoveImage}>
              Remove image
            </button>
          </div>
        )}
        <div className="vault-modal__actions">
          <button type="button" className="button" onClick={cancel}>
            Cancel
          </button>
          <button type="button" className="button button--primary" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
