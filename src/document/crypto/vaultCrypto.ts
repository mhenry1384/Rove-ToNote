/** AES-GCM note encryption backed by the Web Crypto API, keyed by a
 * password-derived (PBKDF2) key shared by every encrypted note in a
 * document. Nothing here persists a key — callers hold the derived
 * CryptoKey in memory only for the life of an unlocked session. */

export const DEFAULT_KDF_ITERATIONS = 210_000;

/** Encrypted once per vault at setup time; a successful decrypt of this
 * exact string against the stored verifier envelope means the entered
 * password is correct, without needing to touch real note content. */
const VERIFIER_PLAINTEXT = "tonote-vault-verifier-v1";

export interface EncryptedEnvelope {
  iv: string;
  ciphertext: string;
}

function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of arr) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

export function generateSalt(): string {
  return toBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriveKey(
  password: string,
  saltBase64: string,
  iterations: number,
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: fromBase64(saltBase64), iterations, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function encryptString(
  key: CryptoKey,
  plaintext: string,
): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

/** Rejects if `key` doesn't match the key the envelope was encrypted with
 * (AES-GCM's authentication tag fails to verify). */
export async function decryptString(
  key: CryptoKey,
  envelope: EncryptedEnvelope,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(envelope.iv) },
    key,
    fromBase64(envelope.ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

export function createVerifier(key: CryptoKey): Promise<EncryptedEnvelope> {
  return encryptString(key, VERIFIER_PLAINTEXT);
}

export async function checkVerifier(
  key: CryptoKey,
  envelope: EncryptedEnvelope,
): Promise<boolean> {
  try {
    return (await decryptString(key, envelope)) === VERIFIER_PLAINTEXT;
  } catch {
    return false;
  }
}

export function serializeEnvelope(envelope: EncryptedEnvelope): string {
  return JSON.stringify(envelope);
}

export function parseEnvelope(content: string): EncryptedEnvelope {
  return JSON.parse(content) as EncryptedEnvelope;
}
