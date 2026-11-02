import { create } from "zustand";

/** Whether the Help → About modal is open — mirrors useBackupStore. */
interface AboutState {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}

export const useAboutStore = create<AboutState>((set) => ({
  isOpen: false,
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
}));
