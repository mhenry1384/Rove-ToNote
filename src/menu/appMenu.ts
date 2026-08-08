import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message, open, save } from "@tauri-apps/plugin-dialog";
import { useDocumentStore } from "../document/documentStore";
import { usePrefsStore } from "../stores/usePrefsStore";

const FILE_FILTERS = [{ name: "ToNote Document", extensions: ["tonote"] }];

function withExtension(path: string): string {
  return path.toLowerCase().endsWith(".tonote") ? path : `${path}.tonote`;
}

async function flushIfDirty(): Promise<void> {
  const { isDirty, save: saveDoc } = useDocumentStore.getState();
  if (isDirty) await saveDoc();
}

async function reportError(context: string, err: unknown): Promise<void> {
  const detail = err instanceof Error ? err.message : String(err);
  await message(`${context}\n\n${detail}`, { title: "ToNote", kind: "error" });
}

export async function handleNew(): Promise<void> {
  await flushIfDirty();
  const path = await save({
    title: "New ToNote Document",
    filters: FILE_FILTERS,
  });
  if (!path) return;
  const fullPath = withExtension(path);
  try {
    await useDocumentStore.getState().newDocument(fullPath);
    await usePrefsStore.getState().setLastOpenedFilePath(fullPath);
  } catch (err) {
    await reportError("Couldn't create that file.", err);
  }
}

export async function handleOpen(): Promise<void> {
  await flushIfDirty();
  const picked = await open({
    title: "Open ToNote Document",
    filters: FILE_FILTERS,
    multiple: false,
  });
  if (!picked || Array.isArray(picked)) return;
  try {
    await useDocumentStore.getState().openDocument(picked);
    await usePrefsStore.getState().setLastOpenedFilePath(picked);
  } catch (err) {
    await reportError("Couldn't open that file.", err);
  }
}

async function handleSave(): Promise<void> {
  try {
    await useDocumentStore.getState().save();
  } catch (err) {
    await reportError("Couldn't save the file.", err);
  }
}

async function handleSaveAs(): Promise<void> {
  const { doc, filePath } = useDocumentStore.getState();
  if (!doc) return;
  const path = await save({
    title: "Save ToNote Document As",
    filters: FILE_FILTERS,
    defaultPath: filePath ?? undefined,
  });
  if (!path) return;
  const fullPath = withExtension(path);
  try {
    await useDocumentStore.getState().saveAs(fullPath);
    await usePrefsStore.getState().setLastOpenedFilePath(fullPath);
  } catch (err) {
    await reportError("Couldn't save the file.", err);
  }
}

async function handleExit(): Promise<void> {
  await flushIfDirty();
  await getCurrentWindow().destroy();
}

let saveMenuItem: MenuItem | null = null;

/** Keeps the Save menu item's enabled state in sync with the document's dirty flag. */
function watchDirtyState(): void {
  useDocumentStore.subscribe((state, prevState) => {
    if (state.isDirty !== prevState.isDirty && saveMenuItem) {
      void saveMenuItem.setEnabled(state.isDirty);
    }
  });
}

let menuInstalled = false;

export async function installAppMenu(): Promise<void> {
  if (menuInstalled) return;
  menuInstalled = true;

  saveMenuItem = await MenuItem.new({
    id: "file-save",
    text: "Save",
    accelerator: "CmdOrCtrl+S",
    enabled: useDocumentStore.getState().isDirty,
    action: () => void handleSave(),
  });

  const fileMenu = await Submenu.new({
    text: "File",
    items: [
      await MenuItem.new({
        id: "file-new",
        text: "New…",
        accelerator: "CmdOrCtrl+N",
        action: () => void handleNew(),
      }),
      await MenuItem.new({
        id: "file-open",
        text: "Open…",
        accelerator: "CmdOrCtrl+O",
        action: () => void handleOpen(),
      }),
      saveMenuItem,
      await MenuItem.new({
        id: "file-save-as",
        text: "Save As…",
        accelerator: "CmdOrCtrl+Shift+S",
        action: () => void handleSaveAs(),
      }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "file-exit",
        text: "Exit",
        action: () => void handleExit(),
      }),
    ],
  });

  const menu = await Menu.new({ items: [fileMenu] });
  await menu.setAsAppMenu();

  watchDirtyState();
}
