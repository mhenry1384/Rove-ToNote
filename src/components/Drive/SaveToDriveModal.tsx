import { useEffect, useRef, useState } from "react";
import { useDocumentStore } from "../../document/documentStore";
import { usePrefsStore } from "../../stores/usePrefsStore";
import { useDriveStore } from "../../stores/useDriveStore";

function withExtension(name: string): string {
  return name.toLowerCase().endsWith(".tonote") ? name : `${name}.tonote`;
}

/** Modal collecting a name for a new Google Drive copy, then creating it —
 * the Drive analog of the native "Save As" file dialog used for local files. */
export function SaveToDriveModal() {
  const isOpen = useDriveStore((s) => s.isSaveCopyOpen);
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName("");
      setError(null);
      setIsSubmitting(false);
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function close() {
    useDriveStore.getState().closeSaveCopyPrompt();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const fullName = withExtension(trimmed);
      await useDocumentStore.getState().saveCopyToDrive(fullName);
      const source = useDocumentStore.getState().source;
      if (source?.kind === "drive") {
        await usePrefsStore.getState().setLastOpenedSource(source);
      }
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="vault-modal-backdrop"
      onMouseDown={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <form
        className="vault-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
      >
        <h3 className="vault-modal__title">Save a Copy to Google Drive</h3>
        <input
          ref={inputRef}
          type="text"
          className="vault-modal__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Document name"
        />
        {error && <p className="vault-modal__error">{error}</p>}
        <div className="vault-modal__actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={!name.trim() || isSubmitting}
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
