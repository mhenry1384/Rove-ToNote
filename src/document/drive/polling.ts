import { getFileMetadata, type DriveFileMetadata } from "./driveApi";

export const DRIVE_POLL_INTERVAL_MS = 45_000;

/**
 * Dumb interval runner with zero document/conflict knowledge — it just calls
 * back with fresh metadata every tick. Transient network errors are
 * swallowed (a Drive file staying open shouldn't die from one flaky poll).
 * Returns a stop function.
 */
export function startPolling(
  fileId: string,
  onTick: (meta: DriveFileMetadata) => void,
): () => void {
  const timer = setInterval(() => {
    void getFileMetadata(fileId)
      .then(onTick)
      .catch(() => {
        // Transient network/API hiccup — try again next tick.
      });
  }, DRIVE_POLL_INTERVAL_MS);
  return () => clearInterval(timer);
}
