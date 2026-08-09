import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, ListChecks, RotateCcw, Trash2 } from "lucide-react";
import { useDocumentStore } from "../../document/documentStore";
import { useSelectionStore } from "../../stores/useSelectionStore";
import { getDeletionRoots } from "../../document/treeUtils";

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
  const notes = useDocumentStore((s) => s.doc?.notes);
  const [isExpanded, setIsExpanded] = useState(false);

  const roots = getDeletionRoots(notes ?? []).sort((a, b) =>
    (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""),
  );
  if (roots.length === 0) return null;

  function handleRestore(id: string) {
    useDocumentStore.getState().restoreNote(id);
    useSelectionStore.getState().select(id);
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
        <span>Recently Deleted ({roots.length})</span>
      </button>
      {isExpanded && (
        <div className="tree-view__deleted-list">
          {roots.map((note) => {
            const Icon = note.type === "todo" ? ListChecks : FileText;
            return (
              <div key={note.id} className="tree-view__deleted-item">
                <Icon size={13} className="tree-item__icon" />
                <span className="tree-view__deleted-title">{note.title}</span>
                <span className="tree-view__deleted-time">{timeAgo(note.deletedAt!)}</span>
                <button
                  type="button"
                  className="icon-button"
                  title="Restore"
                  onClick={() => handleRestore(note.id)}
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
