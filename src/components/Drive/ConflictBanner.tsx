import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useDocumentStore } from "../../document/documentStore";

/** Non-modal bar shown under the titlebar when Drive's file changed remotely
 * while there are unsaved local edits — never resolved silently. */
export function ConflictBanner() {
  const conflict = useDocumentStore((s) => s.driveConflict);
  const [isResolving, setIsResolving] = useState(false);

  if (!conflict) return null;

  async function resolve(choice: "keep-local" | "discard-local") {
    setIsResolving(true);
    try {
      await useDocumentStore.getState().resolveDriveConflict(choice);
    } finally {
      setIsResolving(false);
    }
  }

  return (
    <div className="conflict-banner">
      <AlertTriangle size={16} className="conflict-banner__icon" />
      <span className="conflict-banner__message">
        This document changed on Google Drive while you had unsaved edits.
      </span>
      <div className="conflict-banner__actions">
        <button
          type="button"
          className="button"
          disabled={isResolving}
          onClick={() => void resolve("discard-local")}
        >
          Discard my edits, use Drive's version
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={isResolving}
          onClick={() => void resolve("keep-local")}
        >
          Keep my edits
        </button>
      </div>
    </div>
  );
}
