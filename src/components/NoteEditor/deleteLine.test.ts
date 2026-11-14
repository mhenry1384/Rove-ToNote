import { describe, expect, it } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import type { Node as PMNode } from "@milkdown/kit/prose/model";
import { EditorState, TextSelection } from "@milkdown/kit/prose/state";
import { deleteLine } from "./deleteLine";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "inline*" },
    code_block: { group: "block", content: "text*", code: true },
    bullet_list: { group: "block", content: "list_item+" },
    list_item: { content: "paragraph block*" },
    table: { group: "block", content: "table_row+" },
    table_row: { content: "table_cell+" },
    table_cell: { content: "paragraph+" },
    text: { group: "inline" },
    hardbreak: { group: "inline", inline: true },
  },
});

const n = schema.nodes;
const p = (text = "") => n.paragraph.create(null, text ? schema.text(text) : null);
const li = (...content: PMNode[]) => n.list_item.create(null, content);
const ul = (...items: PMNode[]) => n.bullet_list.create(null, items);
const doc = (...blocks: PMNode[]) => n.doc.create(null, blocks);

/** Runs deleteLine with the cursor right after the first occurrence of `at`. */
function run(d: PMNode, at: string, to?: string): EditorState {
  const find = (s: string) => {
    let found = -1;
    d.descendants((node, pos) => {
      if (found === -1 && node.isText && node.text!.includes(s)) found = pos + node.text!.indexOf(s) + s.length;
    });
    if (found === -1) throw new Error(`not found: ${s}`);
    return found;
  };
  let state = EditorState.create({ doc: d, selection: TextSelection.create(d, find(at), to ? find(to) : undefined) });
  deleteLine(state, (tr) => (state = state.apply(tr)));
  return state;
}

const texts = (state: EditorState) => {
  const out: string[] = [];
  state.doc.descendants((node) => {
    if (node.isTextblock) out.push(node.textContent);
  });
  return out;
};

describe("deleteLine", () => {
  it("deletes the cursor's paragraph and moves to the next line", () => {
    const s = run(doc(p("one"), p("two"), p("three")), "tw");
    expect(texts(s)).toEqual(["one", "three"]);
    expect(s.selection.$from.parent.textContent).toBe("three");
  });

  it("leaves an empty paragraph when deleting the only line", () => {
    const s = run(doc(p("only")), "on");
    expect(s.doc.eq(doc(p()))).toBe(true);
  });

  it("deletes one line of a code block", () => {
    const code = n.code_block.create(null, schema.text("a\nb\nc"));
    expect(run(doc(code), "b").doc.firstChild!.textContent).toBe("a\nc");
    expect(run(doc(code), "c").doc.firstChild!.textContent).toBe("a\nb");
    expect(run(doc(code), "a").doc.firstChild!.textContent).toBe("b\nc");
  });

  it("deletes one line of a paragraph split with hard breaks", () => {
    const para = n.paragraph.create(null, [schema.text("x"), n.hardbreak.create(), schema.text("y")]);
    const s = run(doc(para), "y");
    expect(s.doc.eq(doc(p("x")))).toBe(true);
  });

  it("removes the list item, and the list when it was the last item", () => {
    expect(texts(run(doc(ul(li(p("a")), li(p("b")))), "a"))).toEqual(["b"]);
    expect(run(doc(p("x"), ul(li(p("a")))), "a").doc.eq(doc(p("x")))).toBe(true);
  });

  it("lifts sub-items when deleting a list item that has them", () => {
    const s = run(doc(ul(li(p("parent"), ul(li(p("child")))))), "par");
    expect(s.doc.eq(doc(ul(li(p("child")))))).toBe(true);
  });

  it("only clears the text inside a table cell", () => {
    const table = n.table.create(null, [n.table_row.create(null, [n.table_cell.create(null, p("c1")), n.table_cell.create(null, p("c2"))])]);
    expect(texts(run(doc(table), "c1"))).toEqual(["", "c2"]);
  });

  it("deletes every line a selection touches", () => {
    expect(texts(run(doc(p("one"), p("two"), p("three"), p("four")), "tw", "thr"))).toEqual(["one", "four"]);
  });
});
