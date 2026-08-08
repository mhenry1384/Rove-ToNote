import { useEffect, useRef } from "react";
import { Crepe } from "@milkdown/crepe";
import { commandsCtx, editorViewOptionsCtx } from "@milkdown/kit/core";
import { wrapInHeadingCommand } from "@milkdown/kit/preset/commonmark";
import { Fragment, Slice } from "@milkdown/kit/prose/model";
import { $shortcut } from "@milkdown/kit/utils";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";

/** Ctrl/Cmd-1, -2, -3 set the current block to H1/H2/H3, in addition to
 * Crepe's built-in Ctrl/Cmd-Alt-{1-6}. */
const headingShortcuts = $shortcut((ctx) => {
  const setHeading = (level: number) => () => {
    ctx.get(commandsCtx).call(wrapInHeadingCommand.key, level);
    return true;
  };
  return {
    "Mod-1": setHeading(1),
    "Mod-2": setHeading(2),
    "Mod-3": setHeading(3),
  };
});

/**
 * Plain-text-only pastes (no text/html on the clipboard, e.g. from Notepad)
 * are normally parsed as markdown source by Milkdown's clipboard plugin, so
 * commonmark's soft-line-break rule collapses single newlines into spaces.
 * Rich-text sources (Google Keep, browsers, …) always carry text/html and
 * already paste each line as its own block, so this only needs to special
 * case the plain-text path: treat every line as its own paragraph instead.
 */
function handlePlainTextLinebreakPaste(
  view: import("@milkdown/kit/prose/view").EditorView,
  event: ClipboardEvent,
): boolean {
  const { clipboardData } = event;
  if (!clipboardData || clipboardData.getData("text/html")) return false;

  const text = clipboardData.getData("text/plain");
  if (!/\r\n?|\n/.test(text)) return false;

  const paragraphType = view.state.schema.nodes.paragraph;
  if (!paragraphType) return false;

  const nodes = text
    .split(/\r\n?|\n/)
    .map((line) =>
      paragraphType.create(null, line ? view.state.schema.text(line) : undefined),
    );
  const slice = new Slice(Fragment.from(nodes), 0, 0);
  view.dispatch(view.state.tr.replaceSelection(slice));
  return true;
}

interface MarkdownEditorProps {
  noteId: string;
  defaultValue: string;
  onChange: (markdown: string) => void;
}

/** WYSIWYG markdown editor backed by Milkdown/Crepe. Uncontrolled: content
 * flows out via onChange, and the editor is fully remounted (via the
 * `noteId` key) whenever the selected note changes. */
export function MarkdownEditor({
  noteId,
  defaultValue,
  onChange,
}: MarkdownEditorProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const crepe = new Crepe({
      root,
      defaultValue,
      features: {
        [Crepe.Feature.BlockEdit]: false,
        [Crepe.Feature.Toolbar]: false,
        [Crepe.Feature.TopBar]: true,
      },
      featureConfigs: {
        [Crepe.Feature.Placeholder]: { text: "", mode: "block" },
      },
    });
    crepe.on((api) =>
      api.markdownUpdated((_ctx, markdown) => onChangeRef.current(markdown)),
    );
    crepe.editor.use(headingShortcuts);
    crepe.editor.config((ctx) => {
      ctx.update(editorViewOptionsCtx, (prev) => ({
        ...prev,
        handlePaste: (view, event, slice) =>
          handlePlainTextLinebreakPaste(view, event) ||
          prev.handlePaste?.(view, event, slice) ||
          false,
        // Copying to a plain-text target should read like the rendered
        // note (one line per block, no literal #/**/- markdown syntax),
        // the way Typora's plain-text copy behaves — not the raw markdown
        // source, which is what Milkdown's default clipboard serializer
        // produces (blank-line-separated paragraphs, "# "-prefixed
        // headings, etc).
        clipboardTextSerializer: (slice) =>
          slice.content.textBetween(0, slice.content.size, "\n", "\n"),
      }));
    });
    const createPromise = crepe.create();

    return () => {
      void createPromise.then(() => crepe.destroy());
    };
    // Only recreate the editor when switching notes — `defaultValue` is
    // intentionally read just once, at mount, since it changes on every
    // keystroke via the store round-trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  return <div className="markdown-editor" ref={rootRef} />;
}
