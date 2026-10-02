import { Menu, MenuItem, PredefinedMenuItem, Submenu } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message, open, save } from "@tauri-apps/plugin-dialog";
import { useDocumentStore } from "../document/documentStore";
import { usePrefsStore } from "../stores/usePrefsStore";
import { useDriveStore } from "../stores/useDriveStore";
import { useSelectionStore } from "../stores/useSelectionStore";
import { useBackupStore } from "../stores/useBackupStore";

const FILE_FILTERS = [{ name: "Rove ToNote Document", extensions: ["tonote"] }];

function withExtension(path: string): string {
  return path.toLowerCase().endsWith(".tonote") ? path : `${path}.tonote`;
}

async function flushIfDirty(): Promise<void> {
  const { isDirty, save: saveDoc } = useDocumentStore.getState();
  if (isDirty) await saveDoc();
}

async function reportError(context: string, err: unknown): Promise<void> {
  const detail = err instanceof Error ? err.message : String(err);
  await message(`${context}\n\n${detail}`, { title: "Rove ToNote", kind: "error" });
}

export async function handleNew(): Promise<void> {
  await flushIfDirty();
  const path = await save({
    title: "New Rove ToNote Document",
    filters: FILE_FILTERS,
  });
  if (!path) return;
  const fullPath = withExtension(path);
  try {
    await useDocumentStore.getState().newDocument(fullPath);
    await usePrefsStore.getState().setLastOpenedSource({ kind: "local", path: fullPath });
  } catch (err) {
    await reportError("Couldn't create that file.", err);
  }
}

export async function handleOpen(): Promise<void> {
  await flushIfDirty();
  const picked = await open({
    title: "Open Rove ToNote Document",
    filters: FILE_FILTERS,
    multiple: false,
  });
  if (!picked || Array.isArray(picked)) return;
  try {
    await useDocumentStore.getState().openDocument(picked);
    await usePrefsStore.getState().setLastOpenedSource({ kind: "local", path: picked });
  } catch (err) {
    await reportError("Couldn't open that file.", err);
  }
}

export async function handleSave(): Promise<void> {
  try {
    await useDocumentStore.getState().save();
  } catch (err) {
    await reportError("Couldn't save the file.", err);
  }
}

async function handleSaveAs(): Promise<void> {
  const { doc, source } = useDocumentStore.getState();
  if (!doc) return;
  const path = await save({
    title: "Save Rove ToNote Document As",
    filters: FILE_FILTERS,
    defaultPath: source?.kind === "local" ? source.path : undefined,
  });
  if (!path) return;
  const fullPath = withExtension(path);
  try {
    await useDocumentStore.getState().saveAs(fullPath);
    await usePrefsStore.getState().setLastOpenedSource({ kind: "local", path: fullPath });
  } catch (err) {
    await reportError("Couldn't save the file.", err);
  }
}

/** Signs in if needed, then opens the "pick a Drive file" modal — the modal
 * itself (DriveFilePicker) calls openFromDrive + setLastOpenedSource once
 * the user picks a row. */
export async function handleOpenFromDrive(): Promise<void> {
  await flushIfDirty();
  try {
    if (!useDriveStore.getState().isSignedIn) {
      await useDriveStore.getState().signIn();
    }
    await useDriveStore.getState().openPicker();
  } catch (err) {
    await reportError("Couldn't connect to Google Drive.", err);
  }
}

/** Signs in if needed, then opens the "name this copy" modal — the modal
 * itself (SaveToDriveModal) calls saveCopyToDrive + setLastOpenedSource. */
export async function handleSaveCopyToDrive(): Promise<void> {
  const { doc } = useDocumentStore.getState();
  if (!doc) return;
  try {
    if (!useDriveStore.getState().isSignedIn) {
      await useDriveStore.getState().signIn();
    }
    useDriveStore.getState().openSaveCopyPrompt();
  } catch (err) {
    await reportError("Couldn't connect to Google Drive.", err);
  }
}

async function handleDriveSignOut(): Promise<void> {
  await useDriveStore.getState().signOut();
}

async function handleExit(): Promise<void> {
  try {
    await flushIfDirty();
  } catch (err) {
    // A save failure must never prevent Exit from actually exiting.
    console.error("Failed to save before exiting:", err);
  }
  await getCurrentWindow().destroy();
}

function handleUndoDelete(): void {
  const entry = useDocumentStore.getState().deletedStack[0];
  if (!entry) return;
  useDocumentStore.getState().restoreNote(entry.rootId);
  useSelectionStore.getState().select(entry.rootId);
}

function handleViewBackups(): void {
  useBackupStore.getState().open();
}

let saveMenuItem: MenuItem | null = null;
let driveAuthMenuItem: MenuItem | null = null;
let undoMenuItem: MenuItem | null = null;
let viewBackupsMenuItem: MenuItem | null = null;

/** Keeps the Save menu item's enabled state in sync with the document's dirty flag. */
function watchDirtyState(): void {
  useDocumentStore.subscribe((state, prevState) => {
    if (state.isDirty !== prevState.isDirty && saveMenuItem) {
      void saveMenuItem.setEnabled(state.isDirty);
    }
  });
}

/** Keeps the Undo menu item's enabled state in sync with whether there's a
 * deleted note left to restore. */
function watchDeletedStack(): void {
  useDocumentStore.subscribe((state, prevState) => {
    const hadEntries = prevState.deletedStack.length > 0;
    const hasEntries = state.deletedStack.length > 0;
    if (hadEntries !== hasEntries && undoMenuItem) {
      void undoMenuItem.setEnabled(hasEntries);
    }
  });
}

/** Keeps the "View Backups…" menu item's enabled state in sync with whether a document is open. */
function watchDocumentSource(): void {
  useDocumentStore.subscribe((state, prevState) => {
    if (state.source !== prevState.source && viewBackupsMenuItem) {
      void viewBackupsMenuItem.setEnabled(!!state.source);
    }
  });
}

/** Keeps the Drive sign-in/out menu item's label in sync with auth state. */
function watchDriveAuthState(): void {
  useDriveStore.subscribe((state, prevState) => {
    if (
      (state.isSignedIn !== prevState.isSignedIn || state.accountEmail !== prevState.accountEmail) &&
      driveAuthMenuItem
    ) {
      const label = state.isSignedIn
        ? `Sign Out of Google Drive${state.accountEmail ? ` (${state.accountEmail})` : ""}`
        : "Sign In to Google Drive…";
      void driveAuthMenuItem.setText(label);
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

  driveAuthMenuItem = await MenuItem.new({
    id: "drive-auth",
    text: useDriveStore.getState().isSignedIn ? "Sign Out of Google Drive" : "Sign In to Google Drive…",
    action: () => {
      if (useDriveStore.getState().isSignedIn) void handleDriveSignOut();
      else void useDriveStore.getState().signIn();
    },
  });

  viewBackupsMenuItem = await MenuItem.new({
    id: "file-view-backups",
    text: "View Backups…",
    enabled: !!useDocumentStore.getState().source,
    action: () => handleViewBackups(),
  });

  // No keyboard accelerator: Ctrl+Z is already the markdown editor's own
  // text-undo shortcut, and a global accelerator here would intercept it
  // mid-typing, silently switching the selected note out from under the
  // user (see handleUndoDelete's select() call) and misdirecting keystrokes
  // to the wrong note's content. Menu-click only.
  undoMenuItem = await MenuItem.new({
    id: "edit-undo",
    text: "Undo Delete",
    enabled: useDocumentStore.getState().deletedStack.length > 0,
    action: () => handleUndoDelete(),
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
        id: "file-open-drive",
        text: "Open from Google Drive…",
        action: () => void handleOpenFromDrive(),
      }),
      await MenuItem.new({
        id: "file-save-copy-drive",
        text: "Save a Copy to Google Drive…",
        action: () => void handleSaveCopyToDrive(),
      }),
      driveAuthMenuItem,
      await PredefinedMenuItem.new({ item: "Separator" }),
      viewBackupsMenuItem,
      await PredefinedMenuItem.new({ item: "Separator" }),
      await MenuItem.new({
        id: "file-exit",
        text: "Exit",
        action: () => void handleExit(),
      }),
    ],
  });

  const editMenu = await Submenu.new({
    text: "Edit",
    items: [undoMenuItem],
  });

  const menu = await Menu.new({ items: [fileMenu, editMenu] });
  await menu.setAsAppMenu();

  watchDirtyState();
  watchDriveAuthState();
  watchDeletedStack();
  watchDocumentSource();
}
