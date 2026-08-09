import { create } from "zustand";

const TOAST_DURATION_MS = 6_000;

export interface ToastAction {
  label: string;
  onAction: () => void;
}

interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
}

interface ToastState {
  toast: Toast | null;
  show: (message: string, action?: ToastAction) => void;
  dismiss: () => void;
}

let nextId = 0;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useToastStore = create<ToastState>((set) => ({
  toast: null,
  show: (message, action) => {
    if (hideTimer) clearTimeout(hideTimer);
    const id = ++nextId;
    set({ toast: { id, message, action } });
    hideTimer = setTimeout(() => {
      hideTimer = null;
      set((state) => (state.toast?.id === id ? { toast: null } : state));
    }, TOAST_DURATION_MS);
  },
  dismiss: () => {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    set({ toast: null });
  },
}));
