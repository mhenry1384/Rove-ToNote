import { describe, expect, it } from "vitest";
import { serializeDocument, parseDocument } from "./fileIO";
import type { ToNoteDocument } from "./types";
import {
  decryptString,
  deriveKey,
  encryptString,
  generateSalt,
  parseEnvelope,
  serializeEnvelope,
} from "./crypto/vaultCrypto";

/**
 * NoteEditor only ever calls setNoteContent with an already-encrypted
 * envelope for an encrypted note (see handleEncryptedChange), so the
 * document the store holds — and therefore whatever writeDocumentFile /
 * writeDriveDocument later serializes to disk or Drive — should never
 * contain that note's plaintext, regardless of whether the vault happens
 * to be unlocked at save time.
 */
describe("encrypted note persistence", () => {
  it("keeps an edited encrypted note's content ciphertext through the exact save path (serializeDocument)", async () => {
    const secretPlaintext = "call mom about the surprise party on Friday";
    const salt = generateSalt();
    const key = await deriveKey("correct horse battery staple", salt, 210_000);

    // Mirrors NoteEditor.handleEncryptedChange: encrypt before it ever
    // reaches the document store, while the vault is unlocked.
    const envelope = await encryptString(key, secretPlaintext);
    const storedContent = serializeEnvelope(envelope);

    const doc: ToNoteDocument = {
      formatVersion: 1,
      vault: {
        salt,
        kdfIterations: 210_000,
        verifierIv: "aXY=",
        verifierCiphertext: "Y2lwaGVy",
      },
      notes: [
        {
          id: "1",
          parentId: null,
          title: "Secret note",
          type: "markdown",
          content: storedContent,
          isEncrypted: true,
          sortOrder: 1024,
          createdAt: "2026-08-06T00:00:00.000Z",
          updatedAt: "2026-08-06T00:00:00.000Z",
        },
      ],
    };

    // This is the literal call writeDocumentFile / writeDriveDocument make
    // before handing bytes to the filesystem or Drive API.
    const savedFileContents = serializeDocument(doc);

    expect(savedFileContents).not.toContain(secretPlaintext);

    // And the round-tripped file still decrypts correctly with the vault key.
    const reparsed = parseDocument(savedFileContents);
    const roundTripped = await decryptString(key, parseEnvelope(reparsed.notes[0].content));
    expect(roundTripped).toBe(secretPlaintext);
  });

  it("keeps an unencrypted note's content in the clear (control case)", () => {
    const doc: ToNoteDocument = {
      formatVersion: 1,
      vault: null,
      notes: [
        {
          id: "1",
          parentId: null,
          title: "Public note",
          type: "markdown",
          content: "not a secret",
          isEncrypted: false,
          sortOrder: 1024,
          createdAt: "2026-08-06T00:00:00.000Z",
          updatedAt: "2026-08-06T00:00:00.000Z",
        },
      ],
    };
    expect(serializeDocument(doc)).toContain("not a secret");
  });
});
