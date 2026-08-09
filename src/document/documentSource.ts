export type DocumentSource =
  | { kind: "local"; path: string }
  | { kind: "drive"; fileId: string; name: string; revisionId: string };

export function docKey(source: DocumentSource): string {
  return source.kind === "local" ? `local:${source.path}` : `gdrive:${source.fileId}`;
}

export function displayName(source: DocumentSource): string {
  return source.kind === "local" ? source.path : source.name;
}
