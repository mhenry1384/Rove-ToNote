export type NoteType = "markdown" | "todo";

export interface NoteMeta {
  id: string;
  parentId: string | null;
  title: string;
  type: NoteType;
  /** Plaintext markdown, or a JSON string `{"iv":"..","ciphertext":".."}` when isEncrypted. */
  content: string;
  isEncrypted: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface VaultInfo {
  salt: string;
  kdfIterations: number;
  verifierIv: string;
  verifierCiphertext: string;
}

export interface ToNoteDocument {
  formatVersion: 1;
  vault: VaultInfo | null;
  notes: NoteMeta[];
}

export function createEmptyDocument(): ToNoteDocument {
  return { formatVersion: 1, vault: null, notes: [] };
}
