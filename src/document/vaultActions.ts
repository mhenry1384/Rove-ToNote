import { useDocumentStore } from "./documentStore";
import { useVaultStore } from "../stores/useVaultStore";
import {
  checkVerifier,
  createVerifier,
  decryptString,
  deriveKey,
  DEFAULT_KDF_ITERATIONS,
  encryptString,
  generateSalt,
  parseEnvelope,
  serializeEnvelope,
} from "./crypto/vaultCrypto";

export type ChangePasswordResult = { ok: true } | { ok: false; error: string };

/** Decrypts every encrypted note with the current password and re-encrypts
 * it with the new one, then swaps in fresh vault info (salt/kdf/verifier)
 * and the new in-memory key — all atomically, once every note has
 * successfully round-tripped. Nothing is changed if any step fails. */
export async function changeVaultPassword(
  currentPassword: string,
  newPassword: string,
): Promise<ChangePasswordResult> {
  const doc = useDocumentStore.getState().doc;
  if (!doc?.vault) return { ok: false, error: "No vault password is set yet." };

  const currentKey = await deriveKey(currentPassword, doc.vault.salt, doc.vault.kdfIterations);
  const isCorrect = await checkVerifier(currentKey, {
    iv: doc.vault.verifierIv,
    ciphertext: doc.vault.verifierCiphertext,
  });
  if (!isCorrect) return { ok: false, error: "Current password is incorrect." };

  const salt = generateSalt();
  const kdfIterations = DEFAULT_KDF_ITERATIONS;
  const newKey = await deriveKey(newPassword, salt, kdfIterations);

  const reEncrypted = new Map<string, string>();
  try {
    for (const note of doc.notes) {
      if (!note.isEncrypted) continue;
      const plaintext = await decryptString(currentKey, parseEnvelope(note.content));
      const envelope = await encryptString(newKey, plaintext);
      reEncrypted.set(note.id, serializeEnvelope(envelope));
    }
  } catch {
    return { ok: false, error: "Couldn't re-encrypt one of your notes. Nothing was changed." };
  }

  const verifier = await createVerifier(newKey);
  useDocumentStore.getState().applyVaultPasswordChange(
    { salt, kdfIterations, verifierIv: verifier.iv, verifierCiphertext: verifier.ciphertext },
    reEncrypted,
  );
  useVaultStore.setState({ key: newKey, isUnlocked: true });
  return { ok: true };
}
