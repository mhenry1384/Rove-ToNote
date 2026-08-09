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
  /** Background color id (see noteColors.ts), or absent/null for the default background. */
  color?: string | null;
  /** ISO timestamp when this note was soft-deleted, or absent/null if it's live.
   * Descendants deleted as part of the same delete operation share this exact
   * timestamp, which is how restore/prune know which subtree they belong to. */
  deletedAt?: string | null;
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
