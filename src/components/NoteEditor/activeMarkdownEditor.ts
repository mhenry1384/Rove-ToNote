import type { EditorView } from "@milkdown/kit/prose/view";

/** The currently mounted markdown note editor, so app-menu commands (which
 * live outside React) can act on it. */
let activeView: EditorView | null = null;

export function setActiveMarkdownView(view: EditorView | null): void {
  activeView = view;
}

export function getActiveMarkdownView(): EditorView | null {
  return activeView;
}
