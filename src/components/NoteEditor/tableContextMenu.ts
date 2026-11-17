import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { popupMenu } from "../../menu/popupMenu";
import { commandsCtx, type CmdKey } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import {
  addColAfterCommand,
  addColBeforeCommand,
  addRowAfterCommand,
  addRowBeforeCommand,
} from "@milkdown/kit/preset/gfm";
import { Plugin, PluginKey, TextSelection } from "@milkdown/kit/prose/state";
import { Fragment, type Node } from "@milkdown/kit/prose/model";
import {
  CellSelection,
  deleteColumn,
  deleteRow,
  isInTable,
  selectedRect,
} from "@milkdown/kit/prose/tables";
import type { EditorView } from "@milkdown/kit/prose/view";

/** The row containing `pos`, if it lies inside a table. */
function tableRowAt(view: EditorView, pos: number) {
  const $pos = view.state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const name = $pos.node(depth).type.name;
    if (name === "table_row" || name === "table_header_row") return name;
  }
  return null;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Sorts the table's body rows by the selected column; the header row (always
 * the first row in a GFM table) stays on top. Empty cells sort last either way. */
function sortByColumn(view: EditorView, direction: 1 | -1): void {
  const { state } = view;
  if (!isInTable(state)) return;
  const { table, tableStart, left: col } = selectedRect(state);
  if (table.childCount < 3) return;

  const header = table.child(0);
  const body: Node[] = [];
  for (let i = 1; i < table.childCount; i++) body.push(table.child(i));
  const key = (row: Node) =>
    col < row.childCount ? row.child(col).textContent.trim() : "";

  const sorted = body
    .map((row, index) => ({ row, index, key: key(row) }))
    .sort((a, b) => {
      if (!a.key !== !b.key) return a.key ? -1 : 1;
      return direction * collator.compare(a.key, b.key) || a.index - b.index;
    });
  if (sorted.every((entry, i) => entry.index === i)) return;

  const from = tableStart + header.nodeSize;
  const to = tableStart + table.content.size;
  view.dispatch(state.tr.replaceWith(from, to, Fragment.from(sorted.map((e) => e.row))));
}

async function showTableContextMenu(ctx: Ctx, view: EditorView, isHeaderRow: boolean) {
  const run = (fn: () => void) => () => {
    if (view.isDestroyed) return;
    fn();
    view.focus();
  };
  const call = (key: CmdKey<unknown>) => run(() => ctx.get(commandsCtx).call(key));

  const items = [
    // GFM tables need exactly one header row on top, so rows can't be added
    // above it or have it deleted.
    await MenuItem.new({
      text: "Insert Row Above",
      enabled: !isHeaderRow,
      action: call(addRowBeforeCommand.key),
    }),
    await MenuItem.new({ text: "Insert Row Below", action: call(addRowAfterCommand.key) }),
    await PredefinedMenuItem.new({ item: "Separator" }),
    await MenuItem.new({ text: "Insert Column Left", action: call(addColBeforeCommand.key) }),
    await MenuItem.new({ text: "Insert Column Right", action: call(addColAfterCommand.key) }),
    await PredefinedMenuItem.new({ item: "Separator" }),
    await MenuItem.new({
      text: "Delete Row",
      enabled: !isHeaderRow,
      action: run(() => deleteRow(view.state, view.dispatch)),
    }),
    await MenuItem.new({
      text: "Delete Column",
      action: run(() => deleteColumn(view.state, view.dispatch)),
    }),
    await PredefinedMenuItem.new({ item: "Separator" }),
    await MenuItem.new({
      text: "Sort Column Ascending",
      action: run(() => sortByColumn(view, 1)),
    }),
    await MenuItem.new({
      text: "Sort Column Descending",
      action: run(() => sortByColumn(view, -1)),
    }),
  ];

  const menu = await Menu.new({ items });
  await popupMenu(menu);
}

/** Right-clicking a table cell offers to insert or delete rows and columns. */
export function createTableContextMenuPlugin(ctx: Ctx): Plugin {
  return new Plugin({
    key: new PluginKey("tableContextMenu"),
    props: {
      handleDOMEvents: {
        contextmenu(view, event) {
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (!coords) return false;
          const row = tableRowAt(view, coords.pos);
          if (!row) return false;
          event.preventDefault();

          // Act on the clicked cell, unless it's part of a multi-cell selection.
          const { selection } = view.state;
          const inCellSelection =
            selection instanceof CellSelection &&
            selection.from <= coords.pos &&
            coords.pos <= selection.to;
          if (!inCellSelection) {
            const $pos = view.state.doc.resolve(coords.pos);
            view.dispatch(view.state.tr.setSelection(TextSelection.near($pos)));
          }
          view.focus();
          void showTableContextMenu(ctx, view, row === "table_header_row");
          return true;
        },
      },
    },
  });
}
