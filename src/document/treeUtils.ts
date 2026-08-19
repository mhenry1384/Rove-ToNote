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

/** Prunes a tree down to nodes that themselves match `predicate`, plus
 * whatever ancestors are needed to keep those matches reachable from a
 * root — matching descendants are kept even under a non-matching parent,
 * but a matching node's own non-matching children are dropped. */
export function filterTree(
  nodes: TreeNode[],
  predicate: (node: TreeNode) => boolean,
): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    const children = filterTree(node.children, predicate);
    if (children.length > 0 || predicate(node)) {
      result.push({ ...node, children });
    }
  }
  return result;
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

/** How far (in px) the pointer must move horizontally, past the natural
 * drop position, before a drag is treated as an indent/outdent gesture. */
const INDENT_THRESHOLD_PX = 24;

/** True if `id` is `ancestorId` itself or nested (at any depth) under it. */
function isSelfOrDescendant(
  notes: NoteMeta[],
  ancestorId: string,
  id: string,
): boolean {
  const byId = new Map(notes.map((n) => [n.id, n]));
  let current: string | null = id;
  while (current) {
    if (current === ancestorId) return true;
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
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
 * `overId`, computes where the dragged note should land.
 *
 * By default it adopts the parent of whichever note ends up directly above
 * it (or, if dropped at the very top, the parent of the note now directly
 * below it), and is positioned among that parent's existing children
 * accordingly. A sideways drag past `INDENT_THRESHOLD_PX` overrides this:
 * dragging right nests the note as the last child of the note now above it;
 * dragging left promotes it one or more levels up its former parent chain,
 * landing right after the ancestor branch it came from (never at the end
 * of the list).
 */
export function computeDragMove(
  notes: NoteMeta[],
  visible: VisibleTreeNode[],
  activeId: string,
  overId: string,
  horizontalDelta = 0,
): DragMoveTarget | null {
  const oldIndex = visible.findIndex((v) => v.id === activeId);
  const newIndex = visible.findIndex((v) => v.id === overId);
  if (oldIndex === -1 || newIndex === -1) return null;

  const steps = Math.round(horizontalDelta / INDENT_THRESHOLD_PX);

  // A sideways-only nudge (still hovering its own row) doesn't reorder —
  // it just tries to indent/outdent the note where it already sits.
  const isPureHorizontalNudge = oldIndex === newIndex;
  if (isPureHorizontalNudge && steps === 0) return null;

  let prev: VisibleTreeNode | null;
  let naturalParentId: string | null;

  if (isPureHorizontalNudge) {
    prev = visible[oldIndex - 1] ?? null;
    naturalParentId = notes.find((n) => n.id === activeId)?.parentId ?? null;
  } else {
    const reordered = arrayMove(visible, oldIndex, newIndex);
    const movedPos = reordered.findIndex((v) => v.id === activeId);
    prev = reordered[movedPos - 1] ?? null;
    const next = reordered[movedPos + 1] ?? null;
    naturalParentId = prev ? prev.parentId : (next?.parentId ?? null);
  }

  if (steps > 0 && prev && !isSelfOrDescendant(notes, activeId, prev.id)) {
    const siblings = notes
      .filter((n) => n.parentId === prev.id && n.id !== activeId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
    return {
      newParentId: prev.id,
      beforeId: siblings[siblings.length - 1]?.id ?? null,
      afterId: null,
    };
  }

  if (steps < 0) {
    const byId = new Map(notes.map((n) => [n.id, n]));
    const levels: (string | null)[] = [naturalParentId];
    let current = naturalParentId;
    while (current !== null) {
      current = byId.get(current)?.parentId ?? null;
      levels.push(current);
    }
    const outdentLevels = Math.min(-steps, levels.length - 1);
    if (outdentLevels > 0) {
      const newParentId = levels[outdentLevels];
      const branchId = levels[outdentLevels - 1];
      const siblings = notes
        .filter((n) => n.parentId === newParentId && n.id !== activeId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const branchIndex = siblings.findIndex((s) => s.id === branchId);
      return {
        newParentId,
        beforeId: branchId,
        afterId: branchIndex >= 0 ? (siblings[branchIndex + 1]?.id ?? null) : null,
      };
    }
  }

  // No vertical move happened and the horizontal nudge didn't clear an
  // indent/outdent threshold (or hit a boundary) — nothing to do.
  if (isPureHorizontalNudge) return null;

  const siblings = notes
    .filter((n) => n.parentId === naturalParentId && n.id !== activeId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (!prev) {
    return { newParentId: naturalParentId, beforeId: null, afterId: siblings[0]?.id ?? null };
  }

  const prevIndex = siblings.findIndex((s) => s.id === prev.id);
  return {
    newParentId: naturalParentId,
    beforeId: prev.id,
    afterId: siblings[prevIndex + 1]?.id ?? null,
  };
}

/** A deleted note is a "deletion root" — the top of one soft-deleted subtree —
 * if its parent is missing/live, or was deleted in a different operation. */
function isDeletionRoot(note: NoteMeta, byId: Map<string, NoteMeta>): boolean {
  if (!note.deletedAt) return false;
  const parent = note.parentId ? byId.get(note.parentId) : undefined;
  return !parent || parent.deletedAt !== note.deletedAt;
}

/** The top-level deleted notes, i.e. one entry per delete operation, each
 * representing an entire soft-deleted subtree that can be restored together. */
export function getDeletionRoots(notes: NoteMeta[]): NoteMeta[] {
  const byId = new Map(notes.map((n) => [n.id, n]));
  return notes.filter((n) => isDeletionRoot(n, byId));
}

/** All ids in the soft-deleted subtree rooted at `rootId` — the root plus any
 * descendants that share its exact `deletedAt` (i.e. were deleted alongside it). */
export function collectDeletionSubtreeIds(
  notes: NoteMeta[],
  rootId: string,
): Set<string> {
  const ids = new Set<string>();
  const root = notes.find((n) => n.id === rootId);
  if (!root?.deletedAt) return ids;
  const walk = (id: string) => {
    ids.add(id);
    for (const n of notes) {
      if (n.parentId === id && n.deletedAt === root.deletedAt) walk(n.id);
    }
  };
  walk(rootId);
  return ids;
}

/** Returns the id of `id`'s previous sibling under the same parent, or null if it's the first child. */
export function findPreviousSibling(
  notes: NoteMeta[],
  id: string,
): string | null {
  const note = notes.find((n) => n.id === id);
  if (!note) return null;
  const siblings = notes
    .filter((n) => n.parentId === note.parentId && !n.deletedAt)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const index = siblings.findIndex((n) => n.id === id);
  return index > 0 ? siblings[index - 1].id : null;
}
