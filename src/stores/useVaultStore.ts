import { create } from "zustand";
import { useDocumentStore } from "../document/documentStore";
import {
  checkVerifier,
  createVerifier,
  deriveKey,
  DEFAULT_KDF_ITERATIONS,
  generateSalt,
} from "../document/crypto/vaultCrypto";

/** Auto-relock after this much inactivity, regardless of which note (if
 * any) is open. */
const IDLE_LOCK_MS = 60 * 60 * 1000;

interface VaultPrompt {
  mode: "create" | "unlock";
  error: string | null;
}

interface VaultState {
  isUnlocked: boolean;
  key: CryptoKey | null;
  prompt: VaultPrompt | null;
  /** Whether the "change vault password" modal is open. */
  isChangePasswordOpen: boolean;

  /** Resolves true once unlocked (immediately, or after the user completes
   * the password prompt), false if they cancel. Opens the prompt itself
   * when a password is needed. */
  ensureUnlocked: () => Promise<boolean>;
  submitPassword: (password: string) => Promise<void>;
  cancelPrompt: () => void;
  lock: () => void;
  /** Call on any user interaction; resets the idle-relock timer while unlocked. */
  bumpActivity: () => void;
  openChangePasswordPrompt: () => void;
  closeChangePasswordPrompt: () => void;
}

let pendingResolve: ((ok: boolean) => void) | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

export const useVaultStore = create<VaultState>((set, get) => {
  function armIdleTimer() {
    clearIdleTimer();
    idleTimer = setTimeout(() => get().lock(), IDLE_LOCK_MS);
  }

  return {
    isUnlocked: false,
    key: null,
    prompt: null,
    isChangePasswordOpen: false,

    ensureUnlocked: () => {
      if (get().isUnlocked) {
        armIdleTimer();
        return Promise.resolve(true);
      }
      const doc = useDocumentStore.getState().doc;
      set({ prompt: { mode: doc?.vault ? "unlock" : "create", error: null } });
      return new Promise<boolean>((resolve) => {
        pendingResolve = resolve;
      });
    },

    submitPassword: async (password) => {
      const prompt = get().prompt;
      const doc = useDocumentStore.getState().doc;
      if (!prompt || !doc) return;

      if (prompt.mode === "create") {
        const salt = generateSalt();
        const kdfIterations = DEFAULT_KDF_ITERATIONS;
        const key = await deriveKey(password, salt, kdfIterations);
        const verifier = await createVerifier(key);
        useDocumentStore.getState().setVault({
          salt,
          kdfIterations,
          verifierIv: verifier.iv,
          verifierCiphertext: verifier.ciphertext,
        });
        set({ key, isUnlocked: true, prompt: null });
        armIdleTimer();
        pendingResolve?.(true);
        pendingResolve = null;
        return;
      }

      const vault = doc.vault;
      if (!vault) return;
      const key = await deriveKey(password, vault.salt, vault.kdfIterations);
      const isCorrect = await checkVerifier(key, {
        iv: vault.verifierIv,
        ciphertext: vault.verifierCiphertext,
      });
      if (!isCorrect) {
        set({ prompt: { mode: "unlock", error: "Incorrect password." } });
        return;
      }
      set({ key, isUnlocked: true, prompt: null });
      armIdleTimer();
      pendingResolve?.(true);
      pendingResolve = null;
    },

    cancelPrompt: () => {
      set({ prompt: null });
      pendingResolve?.(false);
      pendingResolve = null;
    },

    lock: () => {
      clearIdleTimer();
      set({ key: null, isUnlocked: false });
    },

    bumpActivity: () => {
      if (get().isUnlocked) armIdleTimer();
    },

    openChangePasswordPrompt: () => set({ isChangePasswordOpen: true }),
    closeChangePasswordPrompt: () => set({ isChangePasswordOpen: false }),
  };
});
