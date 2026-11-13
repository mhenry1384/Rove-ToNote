import { create } from "zustand";
import type { DragMoveTarget } from "../document/treeUtils";

/** Live preview of where a tree drag would land (per computeDragMove),
 * updated on every pointer move — see TreeView. Read by NoteTreeItem to
 * render a drop-position indicator, rather than animating the whole list
 * to a hypothetical order (dnd-kit's built-in sorting strategies assume a
 * flat single-item swap and don't handle our hierarchy-aware drop target
 * correctly — see TreeView's drag handlers for the full story). */
interface DragPreviewState {
  activeId: string | null;
  move: DragMoveTarget | null;
  /** Nesting depth the note would land at (0 = top level), used to indent
   * the drop line so it shows the level as well as the position. */
  depth: number;
  setPreview: (activeId: string, move: DragMoveTarget, depth: number) => void;
  clear: () => void;
}

export const useDragPreviewStore = create<DragPreviewState>((set) => ({
  activeId: null,
  move: null,
  depth: 0,
  setPreview: (activeId, move, depth) => set({ activeId, move, depth }),
  clear: () => set({ activeId: null, move: null, depth: 0 }),
}));
