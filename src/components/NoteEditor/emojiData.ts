export interface EmojiEntry {
  emoji: string;
  name: string;
  group: string;
  /** Lowercased words from the name, group and emojilib keywords, matched
   * by prefix when searching. */
  tokens: string[];
}

export interface EmojiGroup {
  name: string;
  emojis: EmojiEntry[];
}

interface UnicodeEmojiInfo {
  name: string;
  group: string;
  emoji_version: string;
}

/** Newer emoji than this render as blank boxes with the system emoji fonts
 * on current Windows/macOS releases, so leave them out of the picker. */
const MAX_EMOJI_VERSION = 15.0;

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

export function buildEmojiGroups(
  byEmoji: Record<string, UnicodeEmojiInfo>,
  keywords: Record<string, string[]>,
): EmojiGroup[] {
  const groups = new Map<string, EmojiEntry[]>();
  for (const [emoji, info] of Object.entries(byEmoji)) {
    if (parseFloat(info.emoji_version) > MAX_EMOJI_VERSION) continue;
    const tokens = new Set([
      ...tokenize(info.name),
      ...tokenize(info.group),
      ...(keywords[emoji] ?? []).flatMap(tokenize),
    ]);
    let list = groups.get(info.group);
    if (!list) groups.set(info.group, (list = []));
    list.push({ emoji, name: info.name, group: info.group, tokens: [...tokens] });
  }
  return [...groups].map(([name, emojis]) => ({ name, emojis }));
}

/** Every word of the query must prefix-match one of the emoji's tokens, so
 * "smiley" matches the whole "Smileys & Emotion" group and "red heart"
 * narrows to ❤️. */
export function searchEmojis(groups: EmojiGroup[], query: string): EmojiEntry[] {
  const words = tokenize(query);
  if (words.length === 0) return [];
  return groups
    .flatMap((g) => g.emojis)
    .filter((e) => words.every((w) => e.tokens.some((t) => t.startsWith(w))));
}

let groupsPromise: Promise<EmojiGroup[]> | null = null;

/** Lazily loads the emoji tables (a few hundred KB of JSON) the first time
 * the picker is opened, so they stay out of the startup bundle. */
export function loadEmojiGroups(): Promise<EmojiGroup[]> {
  if (!groupsPromise) {
    groupsPromise = Promise.all([
      import("unicode-emoji-json/data-by-emoji.json"),
      import("emojilib"),
    ]).then(([byEmoji, keywords]) =>
      buildEmojiGroups(
        byEmoji.default as Record<string, UnicodeEmojiInfo>,
        keywords.default as Record<string, string[]>,
      ),
    );
  }
  return groupsPromise;
}
