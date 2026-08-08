import { readTextFile, writeTextFile, exists } from "@tauri-apps/plugin-fs";
import type { ToNoteDocument } from "./types";

export class DocumentParseError extends Error {}

export function parseDocument(raw: string): ToNoteDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DocumentParseError("File is not valid JSON.");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("formatVersion" in parsed) ||
    !("notes" in parsed) ||
    !Array.isArray((parsed as { notes: unknown }).notes)
  ) {
    throw new DocumentParseError("File is not a valid ToNote document.");
  }

  const doc = parsed as ToNoteDocument;
  if (doc.formatVersion !== 1) {
    throw new DocumentParseError(
      `Unsupported ToNote document format version: ${String(doc.formatVersion)}`,
    );
  }

  return doc;
}

export function serializeDocument(doc: ToNoteDocument): string {
  return JSON.stringify(doc, null, 2);
}

export async function readDocumentFile(path: string): Promise<ToNoteDocument> {
  const raw = await readTextFile(path);
  return parseDocument(raw);
}

export async function writeDocumentFile(
  path: string,
  doc: ToNoteDocument,
): Promise<void> {
  await writeTextFile(path, serializeDocument(doc));
}

export async function documentFileExists(path: string): Promise<boolean> {
  try {
    return await exists(path);
  } catch {
    return false;
  }
}
