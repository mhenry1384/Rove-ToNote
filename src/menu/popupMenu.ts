import { invoke } from "@tauri-apps/api/core";
import type { Menu } from "@tauri-apps/api/menu";

// The previous popup's menu, closed when the next one opens. Not closed right
// after the popup returns, since the clicked item's action can arrive later.
let lastMenu: Menu | null = null;

/** Shows `menu` as a context menu at a window-relative (CSS px) point, or at
 * the cursor. Goes through our own `popup_context_menu` command rather than
 * `menu.popup()`, which can freeze the app on Windows (see lib.rs). */
export async function popupMenu(menu: Menu, at?: { x: number; y: number }): Promise<void> {
  const previous = lastMenu;
  lastMenu = menu;
  if (previous) void previous.close();
  await invoke("popup_context_menu", { rid: menu.rid, at: at ? [at.x, at.y] : null });
}
