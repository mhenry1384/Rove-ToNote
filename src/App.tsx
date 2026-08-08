import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Lock, Unlock } from "lucide-react";
import "./App.css";
import { useDocumentStore } from "./document/documentStore";
import { usePrefsStore } from "./stores/usePrefsStore";
import { useVaultStore } from "./stores/useVaultStore";
import { installAppMenu, handleNew, handleOpen, handleSave } from "./menu/appMenu";
import { WelcomeScreen } from "./components/Welcome/WelcomeScreen";
import { TreeView } from "./components/TreeView/TreeView";
import { NoteEditor } from "./components/NoteEditor/NoteEditor";
import { PasswordPrompt } from "./components/Vault/PasswordPrompt";

let startupRan = false;

function App() {
  const [isStarting, setIsStarting] = useState(true);
  const doc = useDocumentStore((s) => s.doc);
  const filePath = useDocumentStore((s) => s.filePath);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const loadError = useDocumentStore((s) => s.loadError);
  const isVaultUnlocked = useVaultStore((s) => s.isUnlocked);

  useEffect(() => {
    if (startupRan) {
      setIsStarting(false);
      return;
    }
    startupRan = true;

    void (async () => {
      await installAppMenu();
      await usePrefsStore.getState().load();
      const lastPath = usePrefsStore.getState().prefs.lastOpenedFilePath;
      if (lastPath) {
        try {
          await useDocumentStore.getState().openDocument(lastPath);
        } catch {
          // File moved/corrupt/unreadable — fall back to the welcome screen.
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
        const { isDirty: dirty, save } = useDocumentStore.getState();
        if (dirty) await save();
        await getCurrentWindow().destroy();
      });
    })();
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    useVaultStore.getState().lock();
  }, [filePath]);

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
      <WelcomeScreen
        onNew={() => void handleNew()}
        onOpen={() => void handleOpen()}
        loadError={loadError}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="app-titlebar">
        <span className="app-titlebar__file">
          {filePath}
          {isDirty ? " •" : ""}
        </span>
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
      </header>
      <PasswordPrompt />
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
