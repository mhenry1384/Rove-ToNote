import type { NoteMeta } from "./types";

export interface TreeNode extends NoteMeta {
  children: TreeNode[];
}

/** Builds a parented, sibling-sorted tree from the document's flat notes array. */
export function buildTree(notes: NoteMeta[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const note of notes) byId.set(note.id, { ...note, children: [] });

  const roots: TreeNode[] = [];
  for (const note of notes) {
    const node = byId.get(note.id)!;
    const parent = note.parentId ? byId.get(note.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRecursive = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const node of nodes) sortRecursive(node.children);
  };
  sortRecursive(roots);

  return roots;
}

export interface VisibleTreeNode {
  id: string;
  parentId: string | null;
}

/** Depth-first, currently-visible (i.e. not hidden under a collapsed
 * ancestor) notes in display order — the order drag-and-drop reordering
 * operates over. */
export function flattenVisibleTree(
  tree: TreeNode[],
  isExpanded: (id: string) => boolean,
): VisibleTreeNode[] {
  const result: VisibleTreeNode[] = [];
  const walk = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      result.push({ id: node.id, parentId: node.parentId });
      if (node.children.length > 0 && isExpanded(node.id)) {
        walk(node.children);
      }
    }
  };
  walk(tree);
  return result;
}

export interface DragMoveTarget {
  newParentId: string | null;
  beforeId: string | null;
  afterId: string | null;
}

/** dnd-kit's arrayMove semantics: remove `from`, then splice the item back
 * in at `to` (evaluated against the already-shortened array). */
function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const copy = array.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to < 0 ? copy.length + to : to, 0, item);
  return copy;
}

/**
 * Given the currently-visible note order and a drag from `activeId` onto
 * `overId`, computes where the dragged note should land: it adopts the
 * parent of whichever note ends up directly above it (or, if dropped at
 * the very top, the parent of the note now directly below it), and is
 * positioned among that parent's existing children accordingly.
 */
export function computeDragMove(
  notes: NoteMeta[],
  visible: VisibleTreeNode[],
  activeId: string,
  overId: string,
): DragMoveTarget | null {
  const oldIndex = visible.findIndex((v) => v.id === activeId);
  const newIndex = visible.findIndex((v) => v.id === overId);
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return null;

  const reordered = arrayMove(visible, oldIndex, newIndex);
  const movedPos = reordered.findIndex((v) => v.id === activeId);
  const prev = reordered[movedPos - 1] ?? null;
  const next = reordered[movedPos + 1] ?? null;
  const newParentId = prev ? prev.parentId : (next?.parentId ?? null);

  const siblings = notes
    .filter((n) => n.parentId === newParentId && n.id !== activeId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (!prev) return { newParentId, beforeId: null, afterId: siblings[0]?.id ?? null };

  const prevIndex = siblings.findIndex((s) => s.id === prev.id);
  return {
    newParentId,
    beforeId: prev.id,
    afterId: siblings[prevIndex + 1]?.id ?? null,
  };
}

/** Returns the id of `id`'s previous sibling under the same parent, or null if it's the first child. */
export function findPreviousSibling(
  notes: NoteMeta[],
  id: string,
): string | null {
  const note = notes.find((n) => n.id === id);
  if (!note) return null;
  const siblings = notes
    .filter((n) => n.parentId === note.parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const index = siblings.findIndex((n) => n.id === id);
  return index > 0 ? siblings[index - 1].id : null;
}
