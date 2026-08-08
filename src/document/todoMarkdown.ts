/**
 * Custom markdown grammar for to-do list notes: GFM task-list syntax
 * extended with HTML comments so it degrades gracefully in any plain
 * markdown viewer (comments are invisible) while still round-tripping
 * priority, per-item notes, and sort mode through this app.
 *
 * This is intentionally a hand-rolled line scanner for our own narrow
 * sub-grammar, not a general markdown parser (that job stays with
 * Milkdown for prose notes).
 */

export type Priority = "high" | "medium" | "low" | "none";
export type SortMode = "manual" | "priority" | "alphabetical";

export interface TodoNote {
  id: string;
  text: string;
}

export interface TodoItem {
  id: string;
  text: string;
  checked: boolean;
  priority: Priority;
  notes: TodoNote[];
}

export interface TodoDoc {
  sortMode: SortMode;
  items: TodoItem[];
}

const META_RE =
  /^<!--\s*tonote:todo meta v1 sortMode="(manual|priority|alphabetical)"\s*-->\s*$/;
const ITEM_RE =
  /^- \[([ xX])]\s*(.*?)\s*<!--\s*tonote:item id="([^"]+)"\s*priority="(high|medium|low|none)"\s*-->\s*$/;
const NOTE_RE = /^ {2}- <!--\s*tonote:note id="([^"]+)"\s*-->\s?(.*)$/;
const NOTE_CONTINUATION_RE = /^ {4,}(.*)$/;

export function createEmptyTodoDoc(): TodoDoc {
  return { sortMode: "manual", items: [] };
}

export function parseTodoMarkdown(content: string): TodoDoc {
  const lines = content.split(/\r?\n/);
  let sortMode: SortMode = "manual";
  const items: TodoItem[] = [];
  let currentItem: TodoItem | null = null;
  let currentNote: TodoNote | null = null;

  for (const line of lines) {
    const metaMatch = line.match(META_RE);
    if (metaMatch) {
      sortMode = metaMatch[1] as SortMode;
      currentItem = null;
      currentNote = null;
      continue;
    }

    const itemMatch = line.match(ITEM_RE);
    if (itemMatch) {
      const [, checkedFlag, text, id, priority] = itemMatch;
      currentItem = {
        id,
        text,
        checked: checkedFlag.toLowerCase() === "x",
        priority: priority as Priority,
        notes: [],
      };
      items.push(currentItem);
      currentNote = null;
      continue;
    }

    const noteMatch = line.match(NOTE_RE);
    if (noteMatch && currentItem) {
      const [, id, text] = noteMatch;
      currentNote = { id, text };
      currentItem.notes.push(currentNote);
      continue;
    }

    const contMatch = line.match(NOTE_CONTINUATION_RE);
    if (contMatch && currentNote) {
      currentNote.text += (currentNote.text ? "\n" : "") + contMatch[1];
      continue;
    }

    // Blank lines and anything else (e.g. the separator after the meta
    // comment) are not part of the grammar's payload — skip them.
  }

  return { sortMode, items };
}

export function serializeTodoMarkdown(doc: TodoDoc): string {
  const lines: string[] = [
    `<!-- tonote:todo meta v1 sortMode="${doc.sortMode}" -->`,
    "",
  ];

  for (const item of doc.items) {
    const checkbox = item.checked ? "x" : " ";
    lines.push(
      `- [${checkbox}] ${item.text} <!-- tonote:item id="${item.id}" priority="${item.priority}" -->`,
    );
    for (const note of item.notes) {
      const noteLines = note.text.split("\n");
      lines.push(`  - <!-- tonote:note id="${note.id}" --> ${noteLines[0]}`);
      for (const continuation of noteLines.slice(1)) {
        lines.push(`    ${continuation}`);
      }
    }
  }

  return lines.join("\n");
}

const PRIORITY_RANK: Record<Priority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

/** Pure, non-mutating: computes a display order without touching storage order. */
export function sortItemsForDisplay(
  items: TodoItem[],
  mode: SortMode,
): TodoItem[] {
  if (mode === "manual") return items;
  const copy = [...items];
  if (mode === "priority") {
    copy.sort(
      (a, b) =>
        PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] ||
        a.text.localeCompare(b.text),
    );
  } else if (mode === "alphabetical") {
    copy.sort((a, b) => a.text.localeCompare(b.text));
  }
  return copy;
}
