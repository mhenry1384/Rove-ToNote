import { create } from "zustand";
import {
  getSignedInAccountEmail,
  hasStoredSession,
  performSignIn,
  performSignOut,
} from "../document/drive/googleOAuth";
import { listAppDocuments, type DriveFileMetadata } from "../document/drive/driveApi";

/** Auth/session + picker-modal state only. Sync status and conflict
 * resolution live on documentStore, since they need to call its own
 * save()/doc/isDirty — this store just signs in/out and lists files. */
interface DriveState {
  isSignedIn: boolean;
  accountEmail: string | null;
  isAuthenticating: boolean;
  authError: string | null;

  isPickerOpen: boolean;
  pickerFiles: DriveFileMetadata[];
  pickerLoading: boolean;
  pickerError: string | null;

  isSaveCopyOpen: boolean;

  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  restoreSession: () => Promise<void>;
  openPicker: () => Promise<void>;
  closePicker: () => void;
  openSaveCopyPrompt: () => void;
  closeSaveCopyPrompt: () => void;
}

export const useDriveStore = create<DriveState>((set) => ({
  isSignedIn: false,
  accountEmail: null,
  isAuthenticating: false,
  authError: null,

  isPickerOpen: false,
  pickerFiles: [],
  pickerLoading: false,
  pickerError: null,

  isSaveCopyOpen: false,

  signIn: async () => {
    set({ isAuthenticating: true, authError: null });
    try {
      const { accountEmail } = await performSignIn();
      set({ isSignedIn: true, accountEmail, isAuthenticating: false });
    } catch (err) {
      set({
        isAuthenticating: false,
        authError: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
  },

  signOut: async () => {
    await performSignOut();
    set({ isSignedIn: false, accountEmail: null });
  },

  restoreSession: async () => {
    if (!(await hasStoredSession())) return;
    // Optimistically mark signed-in; a real token refresh happens lazily on
    // first actual Drive use rather than forcing one here.
    set({ isSignedIn: true });
    try {
      const accountEmail = await getSignedInAccountEmail();
      set({ accountEmail });
    } catch {
      // Refresh token may have been revoked externally — leave isSignedIn
      // true; the next real Drive call will surface the auth error properly.
    }
  },

  openPicker: async () => {
    set({ isPickerOpen: true, pickerLoading: true, pickerError: null });
    try {
      const files = await listAppDocuments();
      set({ pickerFiles: files, pickerLoading: false });
    } catch (err) {
      set({
        pickerLoading: false,
        pickerError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  closePicker: () => set({ isPickerOpen: false, pickerFiles: [], pickerError: null }),

  openSaveCopyPrompt: () => set({ isSaveCopyOpen: true }),
  closeSaveCopyPrompt: () => set({ isSaveCopyOpen: false }),
}));
