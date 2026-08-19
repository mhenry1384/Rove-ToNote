import { describe, expect, it } from "vitest";
import { DocumentParseError, parseDocument, serializeDocument } from "./fileIO";
import { createEmptyDocument, type ToNoteDocument } from "./types";

describe("fileIO document round trip", () => {
  it("round-trips an empty document", () => {
    const doc = createEmptyDocument();
    expect(parseDocument(serializeDocument(doc))).toEqual(doc);
  });

  it("round-trips a document with notes and a vault", () => {
    const doc: ToNoteDocument = {
      formatVersion: 1,
      vault: {
        salt: "c2FsdA==",
        kdfIterations: 210000,
        verifierIv: "aXY=",
        verifierCiphertext: "Y2lwaGVy",
      },
      notes: [
        {
          id: "1",
          parentId: null,
          title: "Groceries",
          type: "markdown",
          content: "# Groceries\n\n- milk\n- eggs",
          isEncrypted: false,
          sortOrder: 1024,
          createdAt: "2026-08-06T00:00:00.000Z",
          updatedAt: "2026-08-06T00:00:00.000Z",
        },
      ],
    };
    expect(parseDocument(serializeDocument(doc))).toEqual(doc);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseDocument("{not json")).toThrow(DocumentParseError);
  });

  it("rejects JSON missing required fields", () => {
    expect(() => parseDocument(JSON.stringify({ foo: "bar" }))).toThrow(
      DocumentParseError,
    );
  });

  it("rejects an unsupported format version", () => {
    expect(() =>
      parseDocument(JSON.stringify({ formatVersion: 99, notes: [] })),
    ).toThrow(DocumentParseError);
  });

  it("drops notes carrying a legacy deletedAt marker from an older file format", () => {
    const raw = JSON.stringify({
      formatVersion: 1,
      vault: null,
      notes: [
        {
          id: "1",
          parentId: null,
          title: "Live note",
          type: "markdown",
          content: "",
          isEncrypted: false,
          sortOrder: 1024,
          createdAt: "2026-08-06T00:00:00.000Z",
          updatedAt: "2026-08-06T00:00:00.000Z",
        },
        {
          id: "2",
          parentId: null,
          title: "Old soft-deleted note",
          type: "markdown",
          content: "",
          isEncrypted: false,
          sortOrder: 2048,
          createdAt: "2026-08-06T00:00:00.000Z",
          updatedAt: "2026-08-06T00:00:00.000Z",
          deletedAt: "2026-08-06T00:00:00.000Z",
        },
      ],
    });
    expect(parseDocument(raw).notes.map((n) => n.id)).toEqual(["1"]);
  });
});
