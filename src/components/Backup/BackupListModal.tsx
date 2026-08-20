import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { History } from "lucide-react";
import { useDocumentStore } from "../../document/documentStore";
import { listBackups, type BackupEntry } from "../../document/backup";
import { useBackupStore } from "../../stores/useBackupStore";

/** Modal listing a document's backups; clicking one opens it in a new app
 * instance (a separate OS process) so the original stays untouched. Reuses
 * the same generic modal/list chrome as DriveFilePicker. */
export function BackupListModal() {
  const isOpen = useBackupStore((s) => s.isOpen);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const source = useDocumentStore.getState().source;
    if (!source) return;
    setIsLoading(true);
    setError(null);
    listBackups(source)
      .then((entries) => {
        setBackups(entries);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      });
  }, [isOpen]);

  if (!isOpen) return null;

  function close() {
    useBackupStore.getState().close();
  }

  async function handleOpenBackup(path: string) {
    close();
    try {
      await invoke("open_new_instance", { path });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
      <div className="vault-modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="vault-modal__title">Backups</h3>
        {isLoading && <p className="vault-modal__hint">Loading backups…</p>}
        {error && <p className="vault-modal__error">{error}</p>}
        {!isLoading && !error && backups.length === 0 && (
          <p className="vault-modal__hint">
            No backups yet — one is saved automatically after 5 idle minutes with
            unsaved changes, or when this document is closed.
          </p>
        )}
        {!isLoading && backups.length > 0 && (
          <div className="drive-picker__list">
            {backups.map((backup) => (
              <button
                key={backup.path}
                type="button"
                className="drive-picker__item"
                onClick={() => void handleOpenBackup(backup.path)}
              >
                <History size={14} />
                <span className="drive-picker__item-time">
                  {backup.createdAt.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="vault-modal__actions">
          <button type="button" className="button" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
