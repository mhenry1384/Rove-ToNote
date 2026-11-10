import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey, type Transaction } from "@milkdown/kit/prose/state";
import { isHistoryTransaction } from "@milkdown/kit/prose/history";
import { ReplaceStep } from "@milkdown/kit/prose/transform";
import { Decoration, DecorationSet, type EditorView } from "@milkdown/kit/prose/view";
import {
  findCheckableWords,
  isSpelledCorrectly,
  subscribeToSpellChecker,
} from "./spellChecker";

export interface Misspelling {
  word: string;
  from: number;
  to: number;
}

interface Range {
  from: number;
  to: number;
}

interface SpellCheckState {
  /** Sorted, non-touching spans the user has typed in this session. A
   * zero-length span marks where characters were deleted. */
  typed: Range[];
  /** Caret position while the user is still typing a word; that word isn't
   * flagged until they move on from it. */
  typingAt: number | null;
  decorations: DecorationSet;
}

const REFRESH = "refresh";
const CORRECTION = "correction";

const spellCheckKey = new PluginKey<SpellCheckState>("rove-spell-check");

const NON_TYPING_UI_EVENTS = new Set(["paste", "drop", "cut"]);

function isUserTyping(tr: Transaction): boolean {
  return (
    !tr.getMeta("paste") &&
    !NON_TYPING_UI_EVENTS.has(tr.getMeta("uiEvent")) &&
    tr.getMeta("addToHistory") !== false &&
    tr.getMeta(spellCheckKey) !== CORRECTION &&
    !isHistoryTransaction(tr)
  );
}

/** The spans this transaction typed or deleted, in post-transaction positions.
 * Only plain text within one block counts, which leaves out programmatic
 * block rewrites such as Sort Lines. */
function typedRangesOf(tr: Transaction): Range[] {
  const ranges: Range[] = [];
  tr.steps.forEach((step, index) => {
    if (!(step instanceof ReplaceStep)) return;
    const { slice } = step;
    const size = slice.size;
    if (size > 0) {
      let isPlainText = slice.openStart === 0 && slice.openEnd === 0;
      slice.content.forEach((node) => {
        if (!node.isText) isPlainText = false;
      });
      if (!isPlainText) return;
    } else {
      const doc = tr.docs[index];
      if (!doc.resolve(step.from).sameParent(doc.resolve(step.to))) return;
    }
    const later = tr.mapping.slice(index + 1);
    ranges.push({
      from: later.map(step.from, size > 0 ? 1 : -1),
      to: later.map(step.from + size, -1),
    });
  });
  return ranges;
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: Range[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}

/** Keeps a word that was typed or edited, but not an old word that merely
 * sits next to something typed, such as a space added after it. */
function wordWasTyped(from: number, to: number, typed: Range[]): boolean {
  return typed.some((range) =>
    range.from === range.to
      ? from <= range.from && range.from <= to
      : range.from < to && from < range.to,
  );
}

function isCheckableText(node: ProseNode): boolean {
  return (
    node.isText &&
    !node.marks.some((mark) => mark.type.spec.code || mark.type.name === "link")
  );
}

/** Contiguous prose inside a textblock, so a word split by formatting (such
 * as half-bold) is read as one word. */
function proseRuns(block: ProseNode, contentStart: number): { text: string; from: number }[] {
  const runs: { text: string; from: number }[] = [];
  let current: { text: string; from: number } | null = null;
  block.forEach((child, offset) => {
    if (!isCheckableText(child)) {
      current = null;
      return;
    }
    if (!current) {
      current = { text: "", from: contentStart + offset };
      runs.push(current);
    }
    current.text += child.text ?? "";
  });
  return runs;
}

function buildDecorations(
  doc: ProseNode,
  typed: Range[],
  typingAt: number | null,
): DecorationSet {
  if (typed.length === 0) return DecorationSet.empty;
  const decorations: Decoration[] = [];
  const seenBlocks = new Set<number>();
  for (const range of typed) {
    // Widened by one so a zero-length span still lands in its textblock.
    doc.nodesBetween(
      Math.max(0, range.from - 1),
      Math.min(doc.content.size, range.to + 1),
      (node, pos) => {
        if (!node.isTextblock) return true;
        if (node.type.spec.code || seenBlocks.has(pos)) return false;
        seenBlocks.add(pos);
        for (const run of proseRuns(node, pos + 1)) {
          for (const { word, start, end } of findCheckableWords(run.text)) {
            const from = run.from + start;
            const to = run.from + end;
            const isBeingTyped = typingAt !== null && from <= typingAt && typingAt <= to;
            if (!isBeingTyped && wordWasTyped(from, to, typed) && !isSpelledCorrectly(word)) {
              decorations.push(Decoration.inline(from, to, { class: "spell-error" }, { word }));
            }
          }
        }
        return false;
      },
    );
  }
  return DecorationSet.create(doc, decorations);
}

function applyTransaction(tr: Transaction, prev: SpellCheckState): SpellCheckState {
  const isRefresh = tr.getMeta(spellCheckKey) === REFRESH;
  if (!tr.docChanged && !tr.selectionSet && !isRefresh) return prev;

  let { typed } = prev;
  let typingAt: number | null = null;
  if (tr.docChanged) {
    const newlyTyped = isUserTyping(tr) ? typedRangesOf(tr) : [];
    const mapped = typed
      .map((range) => ({
        from: tr.mapping.map(range.from, 1),
        to: tr.mapping.map(range.to, -1),
      }))
      .filter((range) => range.from <= range.to);
    typed = mergeRanges([...mapped, ...newlyTyped]);
    if (newlyTyped.length > 0 && tr.selection.empty) typingAt = tr.selection.head;
  } else if (isRefresh) {
    typingAt = prev.typingAt;
  }

  if (!tr.docChanged && !isRefresh && typingAt === prev.typingAt) return prev;
  return { typed, typingAt, decorations: buildDecorations(tr.doc, typed, typingAt) };
}

function misspellingAtEvent(view: EditorView, event: MouseEvent): Misspelling | null {
  if (!(event.target as Element | null)?.closest?.(".spell-error")) return null;
  const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
  if (!coords) return null;
  const found = spellCheckKey
    .getState(view.state)
    ?.decorations.find(coords.pos, coords.pos)
    .find((decoration) => decoration.from <= coords.pos && coords.pos <= decoration.to);
  return found ? { word: found.spec.word as string, from: found.from, to: found.to } : null;
}

/** Underlines misspellings in text typed since the editor opened. Existing,
 * pasted and programmatically inserted text is left alone.
 * `onMisspellingContextMenu` runs when a flagged word is right-clicked. */
export function createSpellCheckPlugin(
  onMisspellingContextMenu: (view: EditorView, misspelling: Misspelling) => void,
): Plugin<SpellCheckState> {
  return new Plugin<SpellCheckState>({
    key: spellCheckKey,
    state: {
      init: () => ({ typed: [], typingAt: null, decorations: DecorationSet.empty }),
      apply: applyTransaction,
    },
    view(view) {
      return {
        destroy: subscribeToSpellChecker(() => {
          view.dispatch(view.state.tr.setMeta(spellCheckKey, REFRESH));
        }),
      };
    },
    props: {
      decorations: (state) => spellCheckKey.getState(state)?.decorations,
      // This plugin replaces the webview's own checker, which would flag
      // existing text as well.
      attributes: { spellcheck: "false" },
      handleDOMEvents: {
        contextmenu(view, event) {
          const misspelling = misspellingAtEvent(view, event);
          if (!misspelling) return false;
          event.preventDefault();
          onMisspellingContextMenu(view, misspelling);
          return true;
        },
      },
    },
  });
}

/** Swaps a flagged word for `replacement`, unless the text has since changed. */
export function replaceMisspelling(
  view: EditorView,
  misspelling: Misspelling,
  replacement: string,
): void {
  if (view.isDestroyed) return;
  const { from, to, word } = misspelling;
  if (view.state.doc.textBetween(from, to) !== word) return;
  view.dispatch(view.state.tr.insertText(replacement, from, to).setMeta(spellCheckKey, CORRECTION));
  view.focus();
}
