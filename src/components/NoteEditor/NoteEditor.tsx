import { useEffect, useState } from "react";
import { Folder, Lock } from "lucide-react";
import { useDocumentStore } from "../../document/documentStore";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { useVaultStore } from "../../stores/useVaultStore";
import { MarkdownEditor } from "./MarkdownEditor";
import { TodoEditor } from "./TodoEditor";
import { PasswordGridEditor } from "./PasswordGridEditor";
import { noteColorBg, DEFAULT_BACKGROUND_IMAGE_OPACITY, NOTE_TEXT_COLOR } from "../../document/noteColors";
import {
  decryptString,
  encryptString,
  parseEnvelope,
  serializeEnvelope,
} from "../../document/crypto/vaultCrypto";

export function NoteEditor() {
  const selectedNoteId = useSelectionStore((s) => s.selectedNoteId);
  const note = useDocumentStore((s) =>
    s.doc?.notes.find((n) => n.id === selectedNoteId),
  );
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const vaultKey = useVaultStore((s) => s.key);

  // Decrypted plaintext for the currently-open encrypted note, tagged with
  // the note id it belongs to. Decryption is async, so on the render right
  // after switching notes `note` has already changed but this state
  // hasn't caught up yet — tagging it (rather than storing a bare string)
  // lets the derived `decrypted` below tell "previous note's plaintext,
  // still stale" apart from "this note's plaintext, ready", instead of
  // briefly (or, with unlucky timing, persistently) showing the wrong
  // note's content through the uncontrolled/key-remounted editor below.
  const [decryptedState, setDecryptedState] = useState<{ noteId: string; plaintext: string } | null>(null);
  const [decryptFailedFor, setDecryptFailedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!note || !note.isEncrypted || !isUnlocked || !vaultKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const plaintext = await decryptString(vaultKey, parseEnvelope(note.content));
        if (!cancelled) setDecryptedState({ noteId: note.id, plaintext });
      } catch {
        if (!cancelled) setDecryptFailedFor(note.id);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally re-decrypts only when switching notes, the lock state
    // changes, or the key changes — not on every content edit (we're the
    // ones writing those edits back out, re-encrypted, below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, note?.isEncrypted, isUnlocked, vaultKey]);

  const decrypted =
    note && decryptedState?.noteId === note.id ? decryptedState.plaintext : null;
  const decryptFailed = note ? decryptFailedFor === note.id : false;

  if (!note) {
    return (
      <div className="note-editor note-editor--empty">
        <p>Select a note on the left, or create a new one.</p>
      </div>
    );
  }

  const colorBg = noteColorBg(note.color);
  const wrapperStyle = colorBg
    ? ({
        background: colorBg,
        color: NOTE_TEXT_COLOR,
        "--note-color-bg": colorBg,
      } as React.CSSProperties)
    : undefined;
  const wrapperClass = `note-editor${colorBg ? " note-editor--colored" : ""}`;
  const bgImageStyle: React.CSSProperties | undefined = note.backgroundImageUrl
    ? {
        backgroundImage: `url("${note.backgroundImageUrl.replace(/"/g, "%22")}")`,
        opacity: note.backgroundImageOpacity ?? DEFAULT_BACKGROUND_IMAGE_OPACITY,
      }
    : undefined;
  const bgImage = bgImageStyle && <div className="note-editor__bg-image" style={bgImageStyle} />;

  if (note.isEncrypted) {
    if (!isUnlocked) {
      return (
        <div className={`${wrapperClass} note-editor--locked`} style={wrapperStyle}>
          {bgImage}
          <Lock size={28} />
          <p>This note is encrypted.</p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => void useVaultStore.getState().ensureUnlocked()}
          >
            Unlock
          </button>
        </div>
      );
    }
    if (decryptFailed) {
      return (
        <div className={`${wrapperClass} note-editor--locked`} style={wrapperStyle}>
          {bgImage}
          <Lock size={28} />
          <p>Couldn't decrypt this note — the vault password may not match.</p>
        </div>
      );
    }
    if (decrypted === null) {
      return (
        <div className={`${wrapperClass} note-editor--locked`} style={wrapperStyle}>
          {bgImage}
        </div>
      );
    }
  }

  function handleEncryptedChange(plaintext: string) {
    if (note) setDecryptedState({ noteId: note.id, plaintext });
    if (!vaultKey || !note) return;
    void (async () => {
      const envelope = await encryptString(vaultKey, plaintext);
      useDocumentStore.getState().setNoteContent(note.id, serializeEnvelope(envelope));
    })();
  }

  const content = note.isEncrypted ? (decrypted ?? "") : note.content;
  const handleChange = note.isEncrypted
    ? handleEncryptedChange
    : (value: string) => useDocumentStore.getState().setNoteContent(note.id, value);

  return (
    <div className={wrapperClass} key={note.id} style={wrapperStyle}>
      {bgImage}
      <h2 className="note-editor__title">
        {note.title}
        {note.isEncrypted && <Lock size={14} className="note-editor__lock" />}
      </h2>
      {note.type === "markdown" ? (
        <MarkdownEditor
          noteId={note.id}
          defaultValue={content}
          onChange={handleChange}
        />
      ) : note.type === "todo" ? (
        <TodoEditor content={content} onChange={handleChange} />
      ) : note.type === "password-grid" ? (
        <PasswordGridEditor noteId={note.id} content={content} onChange={handleChange} />
      ) : (
        <div className="note-editor__folder-placeholder">
          <Folder size={28} />
          <p>This is a folder. Select or create a note inside it.</p>
        </div>
      )}
    </div>
  );
}
