import { useEffect, useRef, useState } from "react";
import { useVaultStore } from "../../stores/useVaultStore";

/** Global modal for creating the document's vault password (first time any
 * note is encrypted) or unlocking it (any time content is needed while
 * locked). Rendered once at the app root; visibility is driven entirely by
 * `useVaultStore`'s `prompt` state. */
export function PasswordPrompt() {
  const prompt = useVaultStore((s) => s.prompt);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (prompt) {
      setPassword("");
      setConfirmPassword("");
      setIsSubmitting(false);
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [prompt]);

  if (!prompt) return null;

  const isCreate = prompt.mode === "create";
  const canSubmit = isCreate
    ? password.length >= 4 && password === confirmPassword
    : password.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    await useVaultStore.getState().submitPassword(password);
    setIsSubmitting(false);
  }

  return (
    <div
      className="vault-modal-backdrop"
      onMouseDown={() => useVaultStore.getState().cancelPrompt()}
      onKeyDown={(e) => {
        if (e.key === "Escape") useVaultStore.getState().cancelPrompt();
      }}
    >
      <form
        className="vault-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
      >
        <h3 className="vault-modal__title">
          {isCreate ? "Set an encryption password" : "Enter encryption password"}
        </h3>
        {isCreate && (
          <p className="vault-modal__hint">
            This password protects every encrypted note in this file. There's no
            way to recover it if you forget it.
          </p>
        )}
        <input
          ref={inputRef}
          type="password"
          className="vault-modal__input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
        />
        {isCreate && (
          <input
            type="password"
            className="vault-modal__input"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm password"
          />
        )}
        {prompt.error && <p className="vault-modal__error">{prompt.error}</p>}
        <div className="vault-modal__actions">
          <button
            type="button"
            className="button"
            onClick={() => useVaultStore.getState().cancelPrompt()}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={!canSubmit || isSubmitting}
          >
            {isCreate ? "Create" : "Unlock"}
          </button>
        </div>
      </form>
    </div>
  );
}
