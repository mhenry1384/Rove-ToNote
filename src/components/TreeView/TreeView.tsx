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
import { buildTree, computeDragMove, flattenVisibleTree } from "../../document/treeUtils";
import { NoteTreeItem } from "./NoteTreeItem";
import { TreeToolbar } from "./TreeToolbar";

export function TreeView() {
  const notes = useDocumentStore((s) => s.doc?.notes);
  const filePath = useDocumentStore((s) => s.filePath);
  const expandState = usePrefsStore((s) =>
    filePath ? s.prefs.treeExpandState[filePath] : undefined,
  );
  const tree = useMemo(() => buildTree(notes ?? []), [notes]);

  const visible = useMemo(() => {
    const isExpanded = (id: string) =>
      filePath ? usePrefsStore.getState().isExpanded(filePath, id) : true;
    return flattenVisibleTree(tree, isExpanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, expandState, filePath]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const currentNotes = useDocumentStore.getState().doc?.notes;
    if (!currentNotes) return;
    const move = computeDragMove(
      currentNotes,
      visible,
      String(active.id),
      String(over.id),
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
    </div>
  );
}
