import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { Fragment } from "@milkdown/kit/prose/model";
import type { EditorView } from "@milkdown/kit/prose/view";

const LIST_TYPES = new Set(["bullet_list", "ordered_list"]);

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

/** Alphabetical order by visible text; empty lines go last so blank
 * separators don't all pile up at the top. Stable for equal keys. */
function sortNodes(nodes: PMNode[]): PMNode[] {
  return nodes
    .map((node, i) => ({ node, i, key: node.textContent.trim() }))
    .sort((a, b) => {
      if (!a.key !== !b.key) return a.key ? -1 : 1;
      return collator.compare(a.key, b.key) || a.i - b.i;
    })
    .map((e) => e.node);
}

/**
 * Sorts "lines" (sibling blocks) alphabetically:
 * - selection spanning several blocks → just those blocks;
 * - otherwise, cursor inside a list → that list's items;
 * - otherwise → every top-level block in the note.
 * Done as a single transaction so it's one Ctrl+Z to undo.
 */
export function sortLines(view: EditorView): boolean {
  const { state } = view;
  const { $from, $to } = state.selection;

  let parent: PMNode;
  let parentStart: number; // position of parent's content start
  let startIndex: number;
  let endIndex: number;

  const range = $from.blockRange($to);
  if (range && range.endIndex - range.startIndex > 1) {
    parent = range.parent;
    parentStart = range.$from.start(range.depth);
    startIndex = range.startIndex;
    endIndex = range.endIndex;
  } else {
    let listDepth = -1;
    for (let d = $from.depth; d > 0; d--) {
      if (LIST_TYPES.has($from.node(d).type.name)) {
        listDepth = d;
        break;
      }
    }
    if (listDepth > 0) {
      parent = $from.node(listDepth);
      parentStart = $from.start(listDepth);
    } else {
      parent = state.doc;
      parentStart = 0;
    }
    startIndex = 0;
    endIndex = parent.childCount;
  }

  if (endIndex - startIndex < 2) return false;

  const children: PMNode[] = [];
  let from = parentStart;
  for (let i = 0; i < startIndex; i++) from += parent.child(i).nodeSize;
  let to = from;
  for (let i = startIndex; i < endIndex; i++) {
    const child = parent.child(i);
    children.push(child);
    to += child.nodeSize;
  }

  const sorted = sortNodes(children);
  if (sorted.every((n, i) => n === children[i])) return true;

  view.dispatch(state.tr.replaceWith(from, to, Fragment.fromArray(sorted)).scrollIntoView());
  return true;
}
