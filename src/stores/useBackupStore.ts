import { create } from "zustand";

/** Whether the "View Backups…" modal is open — mirrors useDriveStore's isSaveCopyOpen. */
interface BackupState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useBackupStore = create<BackupState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
