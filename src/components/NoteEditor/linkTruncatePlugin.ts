import { Plugin, PluginKey, type EditorState } from "@milkdown/kit/prose/state";
import { Decoration, DecorationSet } from "@milkdown/kit/prose/view";
import type { Mark } from "@milkdown/kit/prose/model";
import { MAX_LINK_LABEL_LENGTH } from "./linkify";

export const linkTruncateKey = new PluginKey("linkTruncate");

interface LinkRange {
  from: number;
  to: number;
  mark: Mark;
}

/** Contiguous runs of text carrying the same link mark. */
function findLinks(state: EditorState): LinkRange[] {
  const linkType = state.schema.marks.link;
  if (!linkType) return [];
  const ranges: LinkRange[] = [];
  state.doc.descendants((node, pos) => {
    if (!node.isText) return;
    const mark = linkType.isInSet(node.marks);
    if (!mark) return;
    const last = ranges[ranges.length - 1];
    if (last && last.to === pos && last.mark.eq(mark)) last.to = pos + node.nodeSize;
    else ranges.push({ from: pos, to: pos + node.nodeSize, mark });
  });
  return ranges;
}

function buildDecorations(state: EditorState): DecorationSet {
  const { from: selFrom, to: selTo } = state.selection;
  const decorations: Decoration[] = [];
  for (const link of findLinks(state)) {
    if (link.to - link.from <= MAX_LINK_LABEL_LENGTH) continue;
    // Show the whole label while the caret/selection touches it, so it can
    // be edited normally.
    if (selFrom <= link.to && selTo >= link.from) continue;
    const cut = link.from + MAX_LINK_LABEL_LENGTH;
    decorations.push(
      Decoration.inline(cut, link.to, { class: "link-label-hidden" }),
      Decoration.widget(
        cut,
        () => {
          const ellipsis = document.createElement("span");
          ellipsis.className = "link-label-ellipsis";
          ellipsis.textContent = "…";
          return ellipsis;
        },
        { side: -1, marks: [link.mark] },
      ),
    );
  }
  return DecorationSet.create(state.doc, decorations);
}

/** Shortens long link labels to their first MAX_LINK_LABEL_LENGTH characters
 * plus an ellipsis. Display only: the document keeps the full text. */
export function createLinkTruncatePlugin(): Plugin {
  return new Plugin({
    key: linkTruncateKey,
    props: {
      decorations: buildDecorations,
    },
  });
}
