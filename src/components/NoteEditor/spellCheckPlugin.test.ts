import { beforeAll, describe, expect, it } from "vitest";
import { Schema, Slice, Fragment } from "@milkdown/kit/prose/model";
import { EditorState, Plugin, TextSelection } from "@milkdown/kit/prose/state";
import type { DecorationSet } from "@milkdown/kit/prose/view";
import { createSpellCheckPlugin } from "./spellCheckPlugin";
import {
  addCustomWords,
  findCheckableWords,
  getSpellingSuggestions,
  isSpelledCorrectly,
  loadSpellChecker,
} from "./spellChecker";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    code_block: { group: "block", content: "text*", code: true },
    text: { group: "inline" },
  },
  marks: {
    inlineCode: { code: true },
    link: {},
    strong: {},
  },
});

const plugin = createSpellCheckPlugin(() => {}) as Plugin;

function stateWith(...paragraphs: string[]): EditorState {
  const doc = schema.node(
    "doc",
    null,
    paragraphs.map((text) => schema.node("paragraph", null, text ? schema.text(text) : [])),
  );
  return EditorState.create({ doc, plugins: [plugin] });
}

function flagged(state: EditorState): string[] {
  const set = plugin.props.decorations!.call(plugin, state) as DecorationSet;
  return set.find().map((decoration) => decoration.spec.word as string);
}

/** Types one character at a time, the way the editor receives keystrokes. */
function type(state: EditorState, text: string): EditorState {
  let next = state;
  for (const char of text) next = next.apply(next.tr.insertText(char));
  return next;
}

function caretAt(state: EditorState, pos: number): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, pos)));
}

beforeAll(() => loadSpellChecker());

describe("spell-check plugin", () => {
  it("leaves misspellings in the opened document alone", () => {
    expect(flagged(stateWith("this documant is ful of erors"))).toEqual([]);
  });

  it("flags a typed word once it's finished, but not while typing it", () => {
    const state = caretAt(stateWith(""), 1);
    const typing = type(state, "recieve");
    expect(flagged(typing)).toEqual([]);
    expect(flagged(type(typing, " "))).toEqual(["recieve"]);
  });

  it("flags the word when the caret leaves it", () => {
    const typing = type(caretAt(stateWith("", "next"), 1), "recieve");
    expect(flagged(caretAt(typing, 10))).toEqual(["recieve"]);
  });

  it("doesn't flag an old misspelling when a space is typed right after it", () => {
    const state = caretAt(stateWith("documant"), 9);
    expect(flagged(type(state, " "))).toEqual([]);
  });

  it("flags an old word once its letters are edited", () => {
    const state = caretAt(stateWith("documant"), 9);
    expect(flagged(caretAt(type(state, "s"), 1))).toEqual(["documants"]);
  });

  it("clears the flag when the word is fixed", () => {
    const typed = type(caretAt(stateWith(""), 1), "recieve ");
    expect(flagged(typed)).toEqual(["recieve"]);
    const fixed = typed.apply(typed.tr.insertText("receive", 1, 8));
    expect(flagged(fixed)).toEqual([]);
  });

  it("ignores pasted text", () => {
    const state = caretAt(stateWith(""), 1);
    const slice = new Slice(Fragment.from(schema.text("documant ")), 0, 0);
    const tr = state.tr.replaceSelection(slice).setMeta("paste", true).setMeta("uiEvent", "paste");
    expect(flagged(state.apply(tr))).toEqual([]);
  });

  it("ignores programmatic block rewrites", () => {
    const state = stateWith("documant");
    const paragraph = schema.node("paragraph", null, schema.text("documant"));
    const tr = state.tr.replaceWith(0, state.doc.content.size, paragraph);
    expect(flagged(caretAt(state.apply(tr), 1))).toEqual([]);
  });

  it("skips code blocks, inline code and links", () => {
    const code = schema.marks.inlineCode.create();
    const doc = schema.node("doc", null, [
      schema.node("code_block", null, schema.text("x")),
      schema.node("paragraph", null, schema.text("x", [code])),
    ]);
    let state = EditorState.create({ doc, plugins: [plugin] });
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 2)));
    state = type(state, "documant ");
    const inlinePos = state.doc.child(0).nodeSize + 2;
    state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, inlinePos)));
    state = state.apply(state.tr.insertText("documant ", inlinePos));
    expect(flagged(caretAt(state, 1))).toEqual([]);
  });

  it("reads a word split by formatting as one word", () => {
    const strong = schema.marks.strong.create();
    let state = caretAt(stateWith(""), 1);
    state = type(state, "reci");
    state = state.apply(state.tr.addMark(1, 5, strong));
    state = type(state, "eve ");
    expect(flagged(state)).toEqual(["recieve"]);
  });
});

describe("spellChecker", () => {
  it("skips URLs, emails, paths, acronyms, identifiers and numbers", () => {
    const text = "see https://exmaple.com a@exmaple.com C:\\foo\\bar exmaple.org NASA camelCase abc123";
    expect(findCheckableWords(text).map((w) => w.word)).toEqual(["see"]);
  });

  it("reports word offsets, keeping apostrophes inside the word", () => {
    expect(findCheckableWords("(don't) stop")).toEqual([
      { word: "don't", start: 1, end: 6 },
      { word: "stop", start: 8, end: 12 },
    ]);
  });

  it("accepts curly apostrophes", () => {
    expect(isSpelledCorrectly("don’t")).toBe(true);
  });

  it("offers the transposition and apostrophe fixes first", () => {
    expect(getSpellingSuggestions("teh")[0]).toBe("the");
    expect(getSpellingSuggestions("Teh")[0]).toBe("The");
    expect(getSpellingSuggestions("dont")[0]).toBe("don't");
    expect(getSpellingSuggestions("recieve")).toContain("receive");
  });

  it("treats added words as correct", () => {
    expect(isSpelledCorrectly("Tonotey")).toBe(false);
    addCustomWords(["Tonotey"]);
    expect(isSpelledCorrectly("Tonotey")).toBe(true);
  });
});
