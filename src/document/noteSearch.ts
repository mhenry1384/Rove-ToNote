import type { NoteMeta } from "./types";

/** True if `query` is found in the note's title, or in `plaintextContent`.
 * Pass `undefined` for `plaintextContent` to skip content matching
 * entirely — e.g. a locked encrypted note, whose content isn't readable. */
export function noteMatchesQuery(
  note: Pick<NoteMeta, "title">,
  query: string,
  plaintextContent: string | undefined,
): boolean {
  const q = query.toLowerCase();
  if (note.title.toLowerCase().includes(q)) return true;
  return plaintextContent !== undefined && plaintextContent.toLowerCase().includes(q);
}
