import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";
import { useDocumentStore } from "./document/documentStore";
import { usePrefsStore } from "./stores/usePrefsStore";
import { installAppMenu, handleNew, handleOpen } from "./menu/appMenu";
import { WelcomeScreen } from "./components/Welcome/WelcomeScreen";
import { TreeView } from "./components/TreeView/TreeView";
import { NoteEditor } from "./components/NoteEditor/NoteEditor";

let startupRan = false;

function App() {
  const [isStarting, setIsStarting] = useState(true);
  const doc = useDocumentStore((s) => s.doc);
  const filePath = useDocumentStore((s) => s.filePath);
  const isDirty = useDocumentStore((s) => s.isDirty);
  const loadError = useDocumentStore((s) => s.loadError);

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
      </header>
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
