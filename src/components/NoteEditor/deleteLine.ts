import type { Node as PMNode, ResolvedPos } from "@milkdown/kit/prose/model";
import { Fragment } from "@milkdown/kit/prose/model";
import { Selection, TextSelection } from "@milkdown/kit/prose/state";
import type { Command, Transaction } from "@milkdown/kit/prose/state";

const HARD_BREAKS = new Set(["hardbreak", "hard_break"]);
const TABLE_PARTS = new Set(["table", "table_header_row", "table_row", "table_cell", "table_header"]);

const isTablePart = (node: PMNode) =>
  TABLE_PARTS.has(node.type.name) || node.type.spec.tableRole !== undefined;

/** The "line breaks" inside a textblock, as content offsets: newlines in a
 * code block, hard breaks (Shift+Enter) elsewhere. */
function lineBreaks(block: PMNode): number[] {
  const breaks: number[] = [];
  if (block.type.spec.code) {
    const text = block.textContent;
    for (let i = text.indexOf("\n"); i !== -1; i = text.indexOf("\n", i + 1)) breaks.push(i);
  } else {
    block.forEach((child, offset) => {
      if (HARD_BREAKS.has(child.type.name)) breaks.push(offset);
    });
  }
  return breaks;
}

/** Deletes the lines from the one holding `fromOffset` to the one holding
 * `toOffset` inside a textblock that has line breaks. Returns false when
 * those lines are the whole block, so the caller deletes the block. */
function deleteLinesInBlock(tr: Transaction, $pos: ResolvedPos, fromOffset: number, toOffset: number): boolean {
  const block = $pos.parent;
  const breaks = lineBreaks(block);
  if (breaks.length === 0) return false;
  const size = block.content.size;
  // Line i spans [starts[i], ends[i]); breaks[i] separates line i and i+1.
  const starts = [0, ...breaks.map((b) => b + 1)];
  const ends = [...breaks, size];
  const lineOf = (offset: number) => {
    const i = breaks.findIndex((b) => offset <= b);
    return i === -1 ? breaks.length : i;
  };
  const first = lineOf(fromOffset);
  const last = lineOf(toOffset);
  if (first === 0 && last === breaks.length) return false;

  const base = $pos.start();
  let from: number;
  let to: number;
  let cursor: number;
  if (last < breaks.length) {
    // Take the following break with it; the cursor lands on the next line.
    from = starts[first];
    to = starts[last + 1];
    cursor = from;
  } else {
    // Last line of the block: take the preceding break; cursor goes to the
    // start of the line above.
    from = ends[first - 1];
    to = size;
    cursor = starts[first - 1];
  }
  tr.delete(base + from, base + to);
  tr.setSelection(TextSelection.create(tr.doc, base + cursor));
  return true;
}

/** Deletes the textblock at `$pos`, along with any wrapper (list item,
 * blockquote, list) that would otherwise be left empty. */
function deleteBlock(tr: Transaction, $pos: ResolvedPos) {
  let depth = $pos.depth;
  while (depth > 1) {
    const parent = $pos.node(depth - 1);
    if (parent.childCount !== 1 || isTablePart(parent)) break;
    depth--;
  }
  const parent = $pos.node(depth - 1);
  const index = $pos.index(depth - 1);
  const start = $pos.before(depth);
  const end = $pos.after(depth);

  if (parent.canReplace(index, index + 1)) {
    tr.delete(start, end);
  } else if (depth >= 2 && index === 0 && isLiftableListItem(parent, $pos.node(depth - 2))) {
    // A list item's own text, with sub-lists under it: drop the text and move
    // the sub-items up into its place.
    const items: PMNode[] = [];
    parent.forEach((child, _offset, i) => {
      if (i > 0) child.forEach((item) => items.push(item));
    });
    tr.replaceWith($pos.before(depth - 1), $pos.after(depth - 1), Fragment.fromArray(items));
  } else {
    // The block can't go (only block in the note, or in a table cell): leave
    // an empty one of the default kind instead.
    const empty = parent.contentMatchAt(index).defaultType?.createAndFill();
    if (empty) tr.replaceWith(start, end, empty);
    else tr.delete($pos.start(), $pos.end());
  }
  const pos = Math.min(tr.mapping.map(start), tr.doc.content.size);
  tr.setSelection(Selection.near(tr.doc.resolve(pos)));
}

/** True when `item`'s children after the first are all lists whose items can
 * sit directly in `list`. */
function isLiftableListItem(item: PMNode, list: PMNode): boolean {
  if (item.childCount < 2) return false;
  for (let i = 1; i < item.childCount; i++) {
    const sub = item.child(i);
    if (sub.childCount === 0) return false;
    let ok = true;
    sub.forEach((child) => {
      if (child.type !== item.type) ok = false;
    });
    if (!ok) return false;
  }
  return list.type.contentMatch.matchType(item.type) !== null;
}

/**
 * Deletes the line the cursor is on (or every line the selection touches), as
 * one undo step. A "line" is a paragraph, heading or list item, or one line of
 * a code block or of a paragraph split with Shift+Enter.
 */
export const deleteLine: Command = (state, dispatch) => {
  const { $from, $to } = state.selection;
  if (!$from.parent.isTextblock) return false;
  if (!dispatch) return true;

  const tr = state.tr;
  if ($from.sameParent($to)) {
    if (!deleteLinesInBlock(tr, $from, $from.parentOffset, $to.parentOffset)) deleteBlock(tr, $from);
  } else {
    // Spans several blocks: empty them all into the first, then remove it.
    const start = $from.start();
    tr.delete(start, $to.parent.isTextblock ? $to.end() : $to.pos);
    deleteBlock(tr, tr.doc.resolve(tr.mapping.map(start)));
  }
  dispatch(tr.scrollIntoView());
  return true;
};
