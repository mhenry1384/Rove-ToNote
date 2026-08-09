import { Cloud, FilePlus, FolderOpen } from "lucide-react";

interface WelcomeScreenProps {
  onNew: () => void;
  onOpen: () => void;
  onOpenFromDrive: () => void;
  loadError: string | null;
}

export function WelcomeScreen({ onNew, onOpen, onOpenFromDrive, loadError }: WelcomeScreenProps) {
  return (
    <div className="welcome-screen">
      <div className="welcome-screen__card">
        <h1>ToNote</h1>
        <p className="welcome-screen__subtitle">
          Markdown notes and to-do lists, stored in a single file you control.
        </p>
        {loadError && (
          <p className="welcome-screen__error">
            Couldn't reopen your last file: {loadError}
          </p>
        )}
        <div className="welcome-screen__actions">
          <button type="button" className="button button--primary" onClick={onNew}>
            <FilePlus size={16} />
            New Document…
          </button>
          <button type="button" className="button" onClick={onOpen}>
            <FolderOpen size={16} />
            Open Document…
          </button>
          <button type="button" className="button" onClick={onOpenFromDrive}>
            <Cloud size={16} />
            Open from Google Drive…
          </button>
        </div>
      </div>
    </div>
  );
}
