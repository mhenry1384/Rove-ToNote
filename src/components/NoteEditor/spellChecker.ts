import type { default as NSpell } from "nspell";

export interface FoundWord {
  word: string;
  /** Offset of the word's first character in the searched text. */
  start: number;
  /** Offset just past the word's last character. */
  end: number;
}

const WORD = /[\p{L}\p{M}\p{N}_]+(?:['’][\p{L}\p{M}\p{N}_]+)*/gu;
const MAX_SUGGESTIONS = 7;

/** URLs, email addresses, @mentions, #tags and file paths — not prose. */
function isNonProseChunk(chunk: string): boolean {
  return (
    /:\/\/|@|\\/.test(chunk) ||
    /\p{L}\.\p{L}{2,}/u.test(chunk) ||
    /^[/~#]/.test(chunk)
  );
}

/** Acronyms, camelCase identifiers, words with digits, single letters and
 * non-Latin scripts can't be judged by an English dictionary. */
function isCheckableWord(word: string): boolean {
  return (
    word.length > 1 &&
    /^[\p{Script=Latin}\p{M}'’]+$/u.test(word) &&
    !/\p{Lu}/u.test(word.slice(1))
  );
}

/** The words in `text` that are worth spell-checking. */
export function findCheckableWords(text: string): FoundWord[] {
  const found: FoundWord[] = [];
  for (const chunk of text.matchAll(/\S+/g)) {
    if (isNonProseChunk(chunk[0])) continue;
    for (const match of chunk[0].matchAll(WORD)) {
      if (!isCheckableWord(match[0])) continue;
      const start = chunk.index + match.index;
      found.push({ word: match[0], start, end: start + match[0].length });
    }
  }
  return found;
}

function normalizeApostrophes(word: string): string {
  return word.replace(/’/g, "'");
}

let speller: NSpell | null = null;
let loading: Promise<void> | null = null;
const customWords = new Set<string>();
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) listener();
}

/** Calls `listener` whenever previous spelling verdicts may have changed. */
export function subscribeToSpellChecker(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Loads the dictionary once. It's imported on demand so that its ~550 KB
 * isn't parsed at startup. On failure, nothing is reported as misspelled. */
export function loadSpellChecker(): Promise<void> {
  loading ??= (async () => {
    try {
      const [{ default: nspell }, aff, dic] = await Promise.all([
        import("nspell"),
        // The package's `exports` map hides these files from bare imports.
        import("../../../node_modules/dictionary-en/index.aff?raw"),
        import("../../../node_modules/dictionary-en/index.dic?raw"),
      ]);
      speller = nspell(aff.default, dic.default);
      for (const word of customWords) speller.add(word);
      notifyListeners();
    } catch (err) {
      console.error("Couldn't load the spell-check dictionary:", err);
    }
  })();
  return loading;
}

/** Makes every word in `words` count as correctly spelled. */
export function addCustomWords(words: readonly string[]): void {
  const added = words.map(normalizeApostrophes).filter((word) => !customWords.has(word));
  if (added.length === 0) return;
  for (const word of added) {
    customWords.add(word);
    speller?.add(word);
  }
  notifyListeners();
}

export function isSpelledCorrectly(word: string): boolean {
  return !speller || speller.correct(normalizeApostrophes(word));
}

/** Hunspell's edit-distance suggestions miss the two most common typing slips
 * ("teh", "dont"), so those are tried first. */
function typingSlipCorrections(word: string, spell: NSpell): string[] {
  const candidates: string[] = [];
  for (let i = 0; i < word.length - 1; i++) {
    if (word[i] === word[i + 1]) continue;
    const first = i === 0 && /\p{Lu}/u.test(word[0]);
    const swapped = first
      ? word[1].toUpperCase() + word[0].toLowerCase()
      : word[i + 1] + word[i];
    candidates.push(word.slice(0, i) + swapped + word.slice(i + 2));
  }
  for (let i = 1; i < word.length; i++) {
    candidates.push(`${word.slice(0, i)}'${word.slice(i)}`);
  }
  return candidates.filter((candidate) => spell.correct(candidate));
}

/** Replacement candidates for a misspelled word, best first. */
export function getSpellingSuggestions(word: string): string[] {
  if (!speller) return [];
  const normalized = normalizeApostrophes(word);
  const suggestions = [
    ...typingSlipCorrections(normalized, speller),
    ...speller.suggest(normalized),
  ];
  const usesCurlyApostrophe = word.includes("’");
  return [...new Set(suggestions)]
    .slice(0, MAX_SUGGESTIONS)
    .map((suggestion) => (usesCurlyApostrophe ? suggestion.replace(/'/g, "’") : suggestion));
}
