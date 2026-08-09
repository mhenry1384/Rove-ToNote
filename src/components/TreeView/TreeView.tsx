import { useMemo } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDocumentStore } from "../../document/documentStore";
import { usePrefsStore } from "../../stores/usePrefsStore";
import { docKey } from "../../document/documentSource";
import { buildTree, computeDragMove, flattenVisibleTree } from "../../document/treeUtils";
import { NoteTreeItem } from "./NoteTreeItem";
import { TreeToolbar } from "./TreeToolbar";
import { RecentlyDeleted } from "./RecentlyDeleted";

export function TreeView() {
  const notes = useDocumentStore((s) => s.doc?.notes);
  const source = useDocumentStore((s) => s.source);
  const key = source ? docKey(source) : null;
  const expandState = usePrefsStore((s) =>
    key ? s.prefs.treeExpandState[key] : undefined,
  );
  const liveNotes = useMemo(() => (notes ?? []).filter((n) => !n.deletedAt), [notes]);
  const tree = useMemo(() => buildTree(liveNotes), [liveNotes]);

  const visible = useMemo(() => {
    const isExpanded = (id: string) =>
      key ? usePrefsStore.getState().isExpanded(key, id) : true;
    return flattenVisibleTree(tree, isExpanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, expandState, key]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;
    if (!over) return;
    const currentNotes = useDocumentStore.getState().doc?.notes;
    if (!currentNotes) return;
    const move = computeDragMove(
      currentNotes.filter((n) => !n.deletedAt),
      visible,
      String(active.id),
      String(over.id),
      delta.x,
    );
    if (move) {
      useDocumentStore
        .getState()
        .moveNote(String(active.id), move.newParentId, move.beforeId, move.afterId);
    }
  }

  return (
    <div className="tree-view">
      <TreeToolbar />
      <div className="tree-view__list" role="tree">
        {tree.length === 0 ? (
          <p className="tree-view__empty">No notes yet — add one above.</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visible.map((v) => v.id)}
              strategy={verticalListSortingStrategy}
            >
              {tree.map((node) => (
                <NoteTreeItem key={node.id} node={node} depth={0} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
      <RecentlyDeleted />
    </div>
  );
}
