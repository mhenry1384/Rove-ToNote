import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { useDocumentStore } from "../../document/documentStore";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { useVaultStore } from "../../stores/useVaultStore";
import { MarkdownEditor } from "./MarkdownEditor";
import { TodoEditor } from "./TodoEditor";
import { noteColorBg, NOTE_TEXT_COLOR } from "../../document/noteColors";
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

  // Decrypted plaintext for the currently-open encrypted note. Read once
  // per note (like MarkdownEditor's own defaultValue) rather than re-derived
  // on every keystroke — see the effect below.
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [decryptFailed, setDecryptFailed] = useState(false);

  useEffect(() => {
    setDecrypted(null);
    setDecryptFailed(false);
    if (!note || !note.isEncrypted || !isUnlocked || !vaultKey) return;
    let cancelled = false;
    void (async () => {
      try {
        const plaintext = await decryptString(vaultKey, parseEnvelope(note.content));
        if (!cancelled) setDecrypted(plaintext);
      } catch {
        if (!cancelled) setDecryptFailed(true);
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

  if (!note) {
    return (
      <div className="note-editor note-editor--empty">
        <p>Select a note on the left, or create a new one.</p>
      </div>
    );
  }

  const colorBg = noteColorBg(note.color);
  const wrapperStyle = colorBg ? { background: colorBg, color: NOTE_TEXT_COLOR } : undefined;
  const wrapperClass = `note-editor${colorBg ? " note-editor--colored" : ""}`;

  if (note.isEncrypted) {
    if (!isUnlocked) {
      return (
        <div className={`${wrapperClass} note-editor--locked`} style={wrapperStyle}>
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
          <Lock size={28} />
          <p>Couldn't decrypt this note — the vault password may not match.</p>
        </div>
      );
    }
    if (decrypted === null) {
      return <div className={`${wrapperClass} note-editor--locked`} style={wrapperStyle} />;
    }
  }

  function handleEncryptedChange(plaintext: string) {
    setDecrypted(plaintext);
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
      ) : (
        <TodoEditor content={content} onChange={handleChange} />
      )}
    </div>
  );
}
