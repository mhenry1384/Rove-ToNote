/** Content model for "password grid" notes: a simple JSON document (unlike
 * todo lists, there's no plain-text-degradation goal here) stored as
 * NoteMeta.content, same as todo lists store their markdown there. */

export interface PasswordEntry {
  id: string;
  name: string;
  username: string;
  password: string;
  note: string;
}

export interface PasswordGridDoc {
  entries: PasswordEntry[];
}

export function createEmptyPasswordGridDoc(): PasswordGridDoc {
  return { entries: [] };
}

function normalizeEntry(raw: unknown): PasswordEntry | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string") return null;
  return {
    id: r.id,
    name: typeof r.name === "string" ? r.name : "",
    username: typeof r.username === "string" ? r.username : "",
    password: typeof r.password === "string" ? r.password : "",
    note: typeof r.note === "string" ? r.note : "",
  };
}

export function parsePasswordGrid(content: string): PasswordGridDoc {
  if (!content.trim()) return createEmptyPasswordGridDoc();
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as { entries?: unknown }).entries)
    ) {
      return createEmptyPasswordGridDoc();
    }
    const entries = (parsed as { entries: unknown[] }).entries
      .map(normalizeEntry)
      .filter((e): e is PasswordEntry => e !== null);
    return { entries };
  } catch {
    return createEmptyPasswordGridDoc();
  }
}

export function serializePasswordGrid(doc: PasswordGridDoc): string {
  return JSON.stringify(doc, null, 2);
}
