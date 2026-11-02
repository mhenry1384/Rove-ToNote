import { useEffect, useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAboutStore } from "../../stores/useAboutStore";
import { version as appVersion } from "../../../package.json";
import appIcon from "../../assets/app-icon.svg";

const GITHUB_URL = "https://github.com/mhenry1384";

/** Help → About. A custom modal rather than the native message box so it can
 * show the app icon. */
export function AboutModal() {
  const isOpen = useAboutStore((s) => s.isOpen);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isOpen) {
      const raf = requestAnimationFrame(() => okRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function close() {
    useAboutStore.getState().close();
  }

  return (
    <div
      className="vault-modal-backdrop"
      onMouseDown={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <div className="vault-modal about-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="about-modal__header">
          <img src={appIcon} alt="" className="about-modal__icon" />
          <div>
            <h3 className="vault-modal__title">Rove ToNote</h3>
            <p className="vault-modal__hint">Version {appVersion}</p>
          </div>
        </div>
        <p className="about-modal__text">
          A desktop notes app that keeps markdown notes, to-do lists and password grids in a
          single .tonote file, on your disk or on Google Drive, with optional encryption.
        </p>
        <p className="about-modal__text">
          <a
            href={GITHUB_URL}
            onClick={(e) => {
              e.preventDefault();
              openUrl(GITHUB_URL).catch((err) => console.error("Failed to open URL", err));
            }}
          >
            {GITHUB_URL}
          </a>
        </p>
        <p className="vault-modal__hint">
          Licensed under the GNU General Public License v3.0 (GPLv3).
        </p>
        <div className="vault-modal__actions">
          <button ref={okRef} type="button" className="button button--primary" onClick={close}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
