export type NoteType = "markdown" | "todo" | "folder" | "password-grid";

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
  /** Background image URL, shown instead of `color` when set. Only the URL is
   * stored in the document — never the image itself. */
  backgroundImageUrl?: string | null;
  /** Background image opacity from 0 to 1. Falls back to DEFAULT_BACKGROUND_IMAGE_OPACITY
   * when a backgroundImageUrl is set but this is absent. */
  backgroundImageOpacity?: number | null;
  /** Legacy soft-delete marker from an older on-disk format. New code never
   * sets this — deletion is now purely in-memory and session-scoped (see
   * documentStore's deletedStack) — but a note read from an old file may
   * still carry it, and such notes are filtered out on load (see
   * fileIO.parseDocument). */
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
