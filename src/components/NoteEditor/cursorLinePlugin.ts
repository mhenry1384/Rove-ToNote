import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";

export const cursorLineKey = new PluginKey("cursorLine");

/**
 * Highlights the visual line the caret is on (a wrapped paragraph's current
 * screen line, not the whole block). ProseMirror decorations can only style
 * whole nodes or inline ranges, so the highlight is a separate element laid
 * behind the editor content, sized from the caret's screen coordinates. It's
 * hidden by CSS while the editor isn't focused or the selection is a range.
 */
export function createCursorLinePlugin(): Plugin {
  return new Plugin({
    key: cursorLineKey,
    view(view) {
      const host = view.dom.parentElement;
      if (!host) return {};
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.style.isolation = "isolate";

      const bar = document.createElement("div");
      bar.className = "cursor-line-highlight";
      bar.setAttribute("aria-hidden", "true");
      host.insertBefore(bar, view.dom);

      let frame = 0;
      const schedule = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => position(view, host, bar));
      };
      const resize = new ResizeObserver(schedule);
      resize.observe(view.dom);
      schedule();

      return {
        update: schedule,
        destroy() {
          cancelAnimationFrame(frame);
          resize.disconnect();
          bar.remove();
        },
      };
    },
  });
}

function position(view: EditorView, host: HTMLElement, bar: HTMLElement) {
  const { selection } = view.state;
  if (!selection.empty || !selection.$head.parent.isTextblock) {
    bar.hidden = true;
    return;
  }

  let caret: { top: number; bottom: number };
  try {
    caret = view.coordsAtPos(selection.head);
  } catch {
    bar.hidden = true;
    return;
  }

  // The caret rect only covers the glyph height; stretch it to the
  // textblock's line height so consecutive lines tile without gaps.
  let height = caret.bottom - caret.top;
  const block = view.domAtPos(selection.$head.start()).node;
  const blockEl = block instanceof Element ? block : block.parentElement;
  if (blockEl) {
    const lineHeight = parseFloat(getComputedStyle(blockEl).lineHeight);
    if (lineHeight > height) height = lineHeight;
  }
  const middle = (caret.top + caret.bottom) / 2;

  const hostRect = host.getBoundingClientRect();
  const editorRect = view.dom.getBoundingClientRect();
  bar.hidden = false;
  bar.style.top = `${middle - height / 2 - hostRect.top + host.scrollTop}px`;
  bar.style.height = `${height}px`;
  bar.style.left = `${editorRect.left - hostRect.left + host.scrollLeft}px`;
  bar.style.width = `${editorRect.width}px`;
}
