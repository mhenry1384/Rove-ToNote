import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { message } from "@tauri-apps/plugin-dialog";
import { Cloud, CloudOff, KeyRound, Lock, RefreshCw, Unlock } from "lucide-react";
import { version as appVersion } from "../package.json";
import "./App.css";
import { useDocumentStore } from "./document/documentStore";
import { usePrefsStore } from "./stores/usePrefsStore";
import { useVaultStore } from "./stores/useVaultStore";
import { useDriveStore } from "./stores/useDriveStore";
import { usePasswordGridUndoStore } from "./stores/usePasswordGridUndoStore";
import { displayName, docKey } from "./document/documentSource";
import { backupIfNeeded } from "./document/backup";
import { startBackupScheduler } from "./document/backupScheduler";
import {
  installAppMenu,
  handleNew,
  handleOpen,
  handleOpenFromDrive,
  handleSave,
} from "./menu/appMenu";
import { WelcomeScreen } from "./components/Welcome/WelcomeScreen";
import { TreeView } from "./components/TreeView/TreeView";
import { NoteEditor } from "./components/NoteEditor/NoteEditor";
import { PasswordPrompt } from "./components/Vault/PasswordPrompt";
import { ChangePasswordModal } from "./components/Vault/ChangePasswordModal";
import { DriveFilePicker } from "./components/Drive/DriveFilePicker";
import { SaveToDriveModal } from "./components/Drive/SaveToDriveModal";
import { BackupListModal } from "./components/Backup/BackupListModal";
import { ConflictBanner } from "./components/Drive/ConflictBanner";
import { Toast } from "./components/Toast/Toast";

let startupRan = false;

function App() {
  const [isStarting, setIsStarting] = useState(true);
  const doc = useDocumentStore((s) => s.doc);
  const source = useDocumentStore((s) => s.source);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const loadError = useDocumentStore((s) => s.loadError);
  const driveSyncStatus = useDocumentStore((s) => s.driveSyncStatus);
  const isVaultUnlocked = useVaultStore((s) => s.isUnlocked);
  const sourceKey = source ? docKey(source) : null;

  useEffect(() => {
    if (startupRan) {
      setIsStarting(false);
      return;
    }
    startupRan = true;

    void (async () => {
      await installAppMenu();
      startBackupScheduler();
      await usePrefsStore.getState().load();
      await useDriveStore.getState().restoreSession();

      // An instance opened to view a backup (see BackupListModal) is
      // launched with that backup's path as a CLI arg — open it directly
      // and don't let it hijack what the main instance reopens next launch.
      const startupArg = await invoke<string | null>("get_startup_arg").catch(() => null);
      if (startupArg) {
        try {
          await useDocumentStore.getState().openDocument(startupArg);
        } catch {
          // Backup file moved/corrupt — fall back to the welcome screen.
        }
        setIsStarting(false);
        return;
      }

      const lastSource = usePrefsStore.getState().prefs.lastOpenedSource;
      if (lastSource?.kind === "local") {
        try {
          await useDocumentStore.getState().openDocument(lastSource.path);
        } catch {
          // File moved/corrupt/unreadable — fall back to the welcome screen.
        }
      } else if (lastSource?.kind === "drive" && useDriveStore.getState().isSignedIn) {
        try {
          await useDocumentStore.getState().openFromDrive(lastSource.fileId, lastSource.name);
        } catch {
          // Deleted/inaccessible/offline — fall back to the welcome screen.
        }
      }
      setIsStarting(false);
    })();
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await getCurrentWindow().onCloseRequested(async (event) => {
        event.preventDefault();
        try {
          const { isDirty: dirty, save } = useDocumentStore.getState();
          if (dirty) await save();
        } catch (err) {
          // A save failure must never leave the window stuck open with no
          // way to close it — log and still proceed to close below.
          console.error("Failed to save before closing:", err);
        }
        if (useDocumentStore.getState().driveConflict) {
          await message(
            "This document has unresolved changes from Google Drive. Resolve the conflict banner before closing.",
            { title: "Rove ToNote", kind: "warning" },
          );
          return;
        }
        const { source, doc, changedSinceBackup } = useDocumentStore.getState();
        await backupIfNeeded(source, doc, changedSinceBackup).catch(() => {});
        await getCurrentWindow().destroy();
      });
    })();
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    useVaultStore.getState().lock();
    usePasswordGridUndoStore.getState().clear();
  }, [sourceKey]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void handleSave();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const bumpActivity = () => useVaultStore.getState().bumpActivity();
    window.addEventListener("mousemove", bumpActivity);
    window.addEventListener("mousedown", bumpActivity);
    window.addEventListener("keydown", bumpActivity);
    window.addEventListener("wheel", bumpActivity);
    return () => {
      window.removeEventListener("mousemove", bumpActivity);
      window.removeEventListener("mousedown", bumpActivity);
      window.removeEventListener("keydown", bumpActivity);
      window.removeEventListener("wheel", bumpActivity);
    };
  }, []);

  if (isStarting) {
    return <div className="app-loading">Loading…</div>;
  }

  if (!doc) {
    return (
      <>
        <WelcomeScreen
          onNew={() => void handleNew()}
          onOpen={() => void handleOpen()}
          onOpenFromDrive={() => void handleOpenFromDrive()}
          loadError={loadError}
        />
        <DriveFilePicker />
      </>
    );
  }

  const driveStatusTitle =
    driveSyncStatus === "conflict"
      ? "This document changed on Google Drive — resolve the conflict below"
      : driveSyncStatus === "checking"
        ? "Checking Google Drive for updates…"
        : "Synced with Google Drive";

  return (
    <div className="app-shell">
      <header className="app-titlebar">
        <span className="app-titlebar__file">
          {source ? displayName(source) : ""}
          {isDirty ? " •" : ""}
        </span>
        {source?.kind === "drive" && (
          <button type="button" className="icon-button" disabled title={driveStatusTitle}>
            {driveSyncStatus === "checking" ? (
              <RefreshCw size={16} className="icon-button--spinning" />
            ) : driveSyncStatus === "conflict" ? (
              <CloudOff size={16} />
            ) : (
              <Cloud size={16} />
            )}
          </button>
        )}
        <span className="app-titlebar__version">v{appVersion}</span>
        {doc.vault && (
          <button
            type="button"
            className="icon-button"
            title={isVaultUnlocked ? "Lock encrypted notes" : "Unlock encrypted notes"}
            onClick={() => {
              if (isVaultUnlocked) useVaultStore.getState().lock();
              else void useVaultStore.getState().ensureUnlocked();
            }}
          >
            {isVaultUnlocked ? <Unlock size={16} /> : <Lock size={16} />}
          </button>
        )}
        {doc.vault && isVaultUnlocked && (
          <button
            type="button"
            className="icon-button"
            title="Change vault password"
            onClick={() => useVaultStore.getState().openChangePasswordPrompt()}
          >
            <KeyRound size={16} />
          </button>
        )}
      </header>
      <ConflictBanner />
      <PasswordPrompt />
      <ChangePasswordModal />
      <DriveFilePicker />
      <SaveToDriveModal />
      <BackupListModal />
      <Toast />
      <div className="app-body">
        <aside className="app-tree-pane">
          <TreeView />
        </aside>
        <main className="app-editor-pane">
          <NoteEditor />
        </main>
      </div>
    </div>
  );
}

export default App;
