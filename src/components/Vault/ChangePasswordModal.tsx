import { useEffect, useRef, useState } from "react";
import { useVaultStore } from "../../stores/useVaultStore";
import { useToastStore } from "../../stores/useToastStore";
import { changeVaultPassword } from "../../document/vaultActions";

/** Global modal for changing the document's vault password. Rendered once at
 * the app root; visibility is driven by useVaultStore's isChangePasswordOpen. */
export function ChangePasswordModal() {
  const isOpen = useVaultStore((s) => s.isChangePasswordOpen);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setError(null);
      setIsSubmitting(false);
      const raf = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function close() {
    useVaultStore.getState().closeChangePasswordPrompt();
  }

  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= 4 && newPassword === confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    const result = await changeVaultPassword(currentPassword, newPassword);
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    useToastStore.getState().show("Vault password changed.");
    close();
  }

  return (
    <div
      className="vault-modal-backdrop"
      onMouseDown={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <form
        className="vault-modal"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => void handleSubmit(e)}
      >
        <h3 className="vault-modal__title">Change encryption password</h3>
        <p className="vault-modal__hint">
          Every encrypted note is decrypted with your current password and
          re-encrypted with the new one.
        </p>
        <input
          ref={inputRef}
          type="password"
          className="vault-modal__input"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
        />
        <input
          type="password"
          className="vault-modal__input"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
        />
        <input
          type="password"
          className="vault-modal__input"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm new password"
        />
        {error && <p className="vault-modal__error">{error}</p>}
        <div className="vault-modal__actions">
          <button type="button" className="button" onClick={close}>
            Cancel
          </button>
          <button
            type="submit"
            className="button button--primary"
            disabled={!canSubmit || isSubmitting}
          >
            Change Password
          </button>
        </div>
      </form>
    </div>
  );
}
