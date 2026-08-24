import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Folder, KeyRound, ListChecks, RotateCcw, Trash2 } from "lucide-react";
import { useDocumentStore } from "../../document/documentStore";
import { useSelectionStore } from "../../stores/useSelectionStore";

function timeAgo(iso: string): string {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function RecentlyDeleted() {
  const deletedStack = useDocumentStore((s) => s.deletedStack);
  const [isExpanded, setIsExpanded] = useState(false);

  if (deletedStack.length === 0) return null;

  function handleRestore(rootId: string) {
    useDocumentStore.getState().restoreNote(rootId);
    useSelectionStore.getState().select(rootId);
  }

  return (
    <div className="tree-view__deleted">
      <button
        type="button"
        className="tree-view__deleted-header"
        onClick={() => setIsExpanded((v) => !v)}
      >
        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <Trash2 size={13} />
        <span>Recently Deleted ({deletedStack.length})</span>
      </button>
      {isExpanded && (
        <div className="tree-view__deleted-list">
          {deletedStack.map((entry) => {
            const root = entry.notes.find((n) => n.id === entry.rootId);
            if (!root) return null;
            const Icon =
              root.type === "todo"
                ? ListChecks
                : root.type === "folder"
                  ? Folder
                  : root.type === "password-grid"
                    ? KeyRound
                    : FileText;
            return (
              <div key={entry.rootId} className="tree-view__deleted-item">
                <Icon size={13} className="tree-item__icon" />
                <span className="tree-view__deleted-title">{root.title}</span>
                <span className="tree-view__deleted-time">{timeAgo(entry.deletedAt)}</span>
                <button
                  type="button"
                  className="icon-button"
                  title="Restore"
                  onClick={() => handleRestore(entry.rootId)}
                >
                  <RotateCcw size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
