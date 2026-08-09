import { parseDocument, serializeDocument } from "../fileIO";
import type { ToNoteDocument } from "../types";
import { createFile, downloadFileContent, getFileMetadata, updateFileContent } from "./driveApi";

export interface DriveReadResult {
  doc: ToNoteDocument;
  revisionId: string;
  modifiedTime: string;
  name: string;
}

export async function readDriveDocument(fileId: string): Promise<DriveReadResult> {
  const [meta, raw] = await Promise.all([getFileMetadata(fileId), downloadFileContent(fileId)]);
  return {
    doc: parseDocument(raw),
    revisionId: meta.headRevisionId,
    modifiedTime: meta.modifiedTime,
    name: meta.name,
  };
}

export async function writeDriveDocument(
  fileId: string,
  doc: ToNoteDocument,
): Promise<{ revisionId: string; modifiedTime: string }> {
  const meta = await updateFileContent(fileId, serializeDocument(doc));
  return { revisionId: meta.headRevisionId, modifiedTime: meta.modifiedTime };
}

export async function createDriveDocument(
  name: string,
  doc: ToNoteDocument,
): Promise<{ fileId: string; revisionId: string; modifiedTime: string }> {
  const meta = await createFile(name, serializeDocument(doc));
  return { fileId: meta.id, revisionId: meta.headRevisionId, modifiedTime: meta.modifiedTime };
}
