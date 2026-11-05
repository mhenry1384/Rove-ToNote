import { Menu, MenuItem, IconMenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { Image } from "@tauri-apps/api/image";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { useDocumentStore } from "../../document/documentStore";
import {
  deleteNoteWithUndo,
  decryptNote,
  encryptNote,
  decryptAllInFolder,
  encryptAllInFolder,
} from "../../document/noteActions";
import { folderEncryptionState, type TreeNode } from "../../document/treeUtils";
import { NOTE_COLORS } from "../../document/noteColors";

export interface NoteContextMenuOptions {
  node: TreeNode;
  canIndent: boolean;
  onRename: () => void;
  onIndent: () => void;
  onOutdent: () => void;
  onEditBackgroundImage: () => void;
  /** Window-relative (CSS px) point to open at; omitted = at the cursor. */
  at?: { x: number; y: number };
}

const SWATCH_SIZE = 16;
const swatchCache = new Map<string, Promise<Image>>();

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A round color swatch for the native menu; the current color gets a dark
 * center dot, radio-button style. `hex` null draws the "no color" swatch —
 * a light gray disc with a red slash. */
function swatchIcon(hex: string | null, selected: boolean): Promise<Image> {
  const cacheKey = `${hex ?? "none"}:${selected}`;
  let cached = swatchCache.get(cacheKey);
  if (!cached) {
    const rgba = new Uint8Array(SWATCH_SIZE * SWATCH_SIZE * 4);
    const [r, g, b] = hex ? hexToRgb(hex) : [230, 230, 230];
    const c = (SWATCH_SIZE - 1) / 2;
    const radius = SWATCH_SIZE / 2 - 0.5;
    for (let y = 0; y < SWATCH_SIZE; y++) {
      for (let x = 0; x < SWATCH_SIZE; x++) {
        const d = Math.hypot(x - c, y - c);
        // 1px anti-aliased edge.
        const coverage = Math.max(0, Math.min(1, radius - d + 0.5));
        if (coverage === 0) continue;
        let px: [number, number, number] = [r, g, b];
        if (d > radius - 1.2) px = [120, 120, 120]; // outline
        else if (!hex && Math.abs(x - (SWATCH_SIZE - 1 - y)) <= 0.8) px = [217, 48, 37];
        if (selected && d < 3.2) px = [40, 40, 40];
        const i = (y * SWATCH_SIZE + x) * 4;
        rgba.set([...px, Math.round(coverage * 255)], i);
      }
    }
    cached = Image.new(rgba, SWATCH_SIZE, SWATCH_SIZE);
    swatchCache.set(cacheKey, cached);
  }
  return cached;
}

// The previous popup's menu, closed when the next one opens. Not closed right
// after `popup()` returns, since the clicked item's action can arrive later.
let lastMenu: Menu | null = null;

/** The tree row's actions menu, shared by the "…" button and right-click.
 * Native rather than HTML so it can extend past the narrow tree pane. */
export async function showNoteContextMenu(opts: NoteContextMenuOptions): Promise<void> {
  const { node } = opts;
  const store = useDocumentStore.getState();
  const notes = store.doc?.notes ?? [];
  const canDelete = node.type !== "folder" || node.children.length === 0;
  const folderEncryption = node.type === "folder" ? folderEncryptionState(notes, node.id) : null;
  const separator = () => PredefinedMenuItem.new({ item: "Separator" });

  const items: (MenuItem | Submenu | PredefinedMenuItem)[] = [
    await MenuItem.new({ text: "Rename", action: opts.onRename }),
  ];
  if (canDelete) {
    items.push(await MenuItem.new({ text: "Delete", action: () => deleteNoteWithUndo(node.id) }));
  }
  if (node.type !== "folder") {
    items.push(
      await MenuItem.new({
        text: node.isEncrypted ? "Decrypt" : "Encrypt",
        action: () => void (node.isEncrypted ? decryptNote(node.id) : encryptNote(node.id)),
      }),
    );
  }
  if (folderEncryption?.hasEncrypted) {
    items.push(
      await MenuItem.new({ text: "Decrypt All", action: () => void decryptAllInFolder(node.id) }),
    );
  }
  if (folderEncryption?.hasUnencrypted) {
    items.push(
      await MenuItem.new({ text: "Encrypt All", action: () => void encryptAllInFolder(node.id) }),
    );
  }
  if (opts.canIndent || node.parentId !== null) {
    items.push(await separator());
    if (opts.canIndent) {
      items.push(await MenuItem.new({ text: "Indent (make sub-item)", action: opts.onIndent }));
    }
    if (node.parentId !== null) {
      items.push(await MenuItem.new({ text: "Outdent", action: opts.onOutdent }));
    }
  }

  items.push(await separator());
  const colorItems = [
    await IconMenuItem.new({
      text: "Default",
      icon: await swatchIcon(null, !node.color),
      action: () => useDocumentStore.getState().setNoteColor(node.id, null),
    }),
  ];
  for (const color of NOTE_COLORS) {
    colorItems.push(
      await IconMenuItem.new({
        text: color.label,
        icon: await swatchIcon(color.bg, node.color === color.id),
        action: () => useDocumentStore.getState().setNoteColor(node.id, color.id),
      }),
    );
  }
  items.push(await Submenu.new({ text: "Background Color", items: colorItems }));

  const imageItems: MenuItem[] = [
    await MenuItem.new({
      text: node.backgroundImageUrl ? "Edit Image…" : "Set Image…",
      action: opts.onEditBackgroundImage,
    }),
  ];
  if (node.backgroundImageUrl) {
    imageItems.push(
      await MenuItem.new({
        text: "Remove Image",
        action: () => useDocumentStore.getState().setNoteBackgroundImage(node.id, null),
      }),
    );
  }
  items.push(await Submenu.new({ text: "Background Image", items: imageItems }));

  const menu = await Menu.new({ items });
  const previous = lastMenu;
  lastMenu = menu;
  if (previous) void previous.close();
  await menu.popup(opts.at ? new LogicalPosition(opts.at.x, opts.at.y) : undefined);
}
