import { useDocumentStore } from "./documentStore";
import { backupIfNeeded } from "./backup";

const IDLE_BACKUP_MS = 5 * 60 * 1000;
const CHECK_INTERVAL_MS = 30 * 1000;

let lastActivityAt = Date.now();
let started = false;

function bumpActivity() {
  lastActivityAt = Date.now();
}

async function checkIdleBackup() {
  if (Date.now() - lastActivityAt < IDLE_BACKUP_MS) return;
  const { source, doc, changedSinceBackup } = useDocumentStore.getState();
  const wroteBackup = await backupIfNeeded(source, doc, changedSinceBackup).catch(() => false);
  if (wroteBackup) {
    useDocumentStore.setState({ changedSinceBackup: false });
  }
}

/** Starts the idle-backup timer: after 5 minutes with no mouse/keyboard
 * activity, writes a snapshot backup if the doc changed since the last one.
 * Safe to call once at app startup. */
export function startBackupScheduler(): void {
  if (started) return;
  started = true;
  window.addEventListener("mousemove", bumpActivity);
  window.addEventListener("mousedown", bumpActivity);
  window.addEventListener("keydown", bumpActivity);
  window.addEventListener("wheel", bumpActivity);
  setInterval(() => void checkIdleBackup(), CHECK_INTERVAL_MS);
}
