import { Cloud } from "lucide-react";
import { useDocumentStore } from "../../document/documentStore";
import { usePrefsStore } from "../../stores/usePrefsStore";
import { useDriveStore } from "../../stores/useDriveStore";

/** Modal for picking a file to open from Google Drive. Reuses the generic
 * `.vault-modal-backdrop`/`.vault-modal` chrome (not vault-specific styling,
 * just the modal shell) rather than duplicating it. */
export function DriveFilePicker() {
  const isOpen = useDriveStore((s) => s.isPickerOpen);
  const files = useDriveStore((s) => s.pickerFiles);
  const isLoading = useDriveStore((s) => s.pickerLoading);
  const error = useDriveStore((s) => s.pickerError);

  if (!isOpen) return null;

  async function handlePick(fileId: string, name: string) {
    useDriveStore.getState().closePicker();
    try {
      await useDocumentStore.getState().openFromDrive(fileId, name);
      const source = useDocumentStore.getState().source;
      if (source?.kind === "drive") {
        await usePrefsStore.getState().setLastOpenedSource(source);
      }
    } catch {
      // openFromDrive already sets documentStore's loadError, which the app
      // shell surfaces on the welcome screen if this leaves no doc open.
    }
  }

  return (
    <div
      className="vault-modal-backdrop"
      onMouseDown={() => useDriveStore.getState().closePicker()}
      onKeyDown={(e) => {
        if (e.key === "Escape") useDriveStore.getState().closePicker();
      }}
    >
      <div className="vault-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="vault-modal__title">Open from Google Drive</h3>
        {isLoading && <p className="vault-modal__hint">Loading your documents…</p>}
        {error && <p className="vault-modal__error">{error}</p>}
        {!isLoading && !error && files.length === 0 && (
          <p className="vault-modal__hint">
            No Rove ToNote documents found in Google Drive yet — use "Save a Copy to
            Google Drive" to create one.
          </p>
        )}
        {!isLoading && files.length > 0 && (
          <div className="drive-picker__list">
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                className="drive-picker__item"
                onClick={() => void handlePick(file.id, file.name)}
              >
                <Cloud size={14} />
                <span className="drive-picker__item-name">{file.name}</span>
                <span className="drive-picker__item-time">
                  {new Date(file.modifiedTime).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="vault-modal__actions">
          <button
            type="button"
            className="button"
            onClick={() => useDriveStore.getState().closePicker()}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
