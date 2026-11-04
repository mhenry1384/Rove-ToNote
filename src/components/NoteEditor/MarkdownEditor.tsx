import { useCallback, useEffect, useRef, useState } from "react";
import { Crepe } from "@milkdown/crepe";
import { commandsCtx, editorViewCtx, editorViewOptionsCtx } from "@milkdown/kit/core";
import type { EditorView } from "@milkdown/kit/prose/view";
import { getActiveMarkdownView, setActiveMarkdownView } from "./activeMarkdownEditor";
import { EmojiPicker } from "./EmojiPicker";
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

/** Material "mood" face, as an SVG string for Crepe's top bar. The class lets
 * us find the rendered button to anchor the picker popup to. */
const emojiIcon = `<svg class="emoji-picker-icon"xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/><circle cx="15.5" cy="9.5" r="1.5"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M12 17.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>`;

const isMac = /Mac/.test(navigator.userAgent);
const mod = isMac ? "⌘" : "Ctrl+";
const alt = isMac ? "⌥" : "Alt+";
const shift = isMac ? "⇧" : "Shift+";

/** Hover tooltips for Crepe's top-bar buttons, keyed by item key. Crepe's
 * items have no label/title option, so the text rides along on the icon SVG
 * as a data attribute and is copied onto the button on hover, where CSS
 * renders it (a native `title` tooltip's OS-drawn border can't be styled). */
const topBarTooltips: Record<string, string> = {
  bold: `Bold (${mod}B)`,
  italic: `Italic (${mod}I)`,
  strikethrough: `Strikethrough (${mod}${alt}X)`,
  code: `Inline code (${mod}E)`,
  "bullet-list": `Bulleted list (${mod}${alt}8)`,
  "ordered-list": `Numbered list (${mod}${alt}7)`,
  "task-list": "Checklist",
  link: "Link",
  image: "Insert image",
  table: "Insert table",
  "code-block": `Code block (${mod}${alt}C)`,
  math: "Math (LaTeX) block",
  quote: `Quote (${mod}${shift}B)`,
  hr: "Horizontal line",
  emoji: "Emoji",
};

function setTopBarTitleOnHover(event: PointerEvent) {
  const button = (event.target as Element | null)?.closest?.(".top-bar-item");
  if (!(button instanceof HTMLElement) || button.dataset.tooltip) return;
  const tooltip = button.querySelector("[data-tooltip]")?.getAttribute("data-tooltip");
  if (tooltip) {
    button.dataset.tooltip = tooltip;
    button.setAttribute("aria-label", tooltip);
  }
}

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
  const viewRef = useRef<EditorView | null>(null);
  const [emojiAnchor, setEmojiAnchor] = useState<HTMLElement | null>(null);
  const emojiAnchorRef = useRef(emojiAnchor);
  emojiAnchorRef.current = emojiAnchor;

  const closeEmojiPicker = useCallback(() => {
    setEmojiAnchor(null);
    viewRef.current?.focus();
  }, []);

  const insertEmoji = useCallback(
    (emoji: string) => {
      const view = viewRef.current;
      if (view) view.dispatch(view.state.tr.insertText(emoji).scrollIntoView());
      closeEmojiPicker();
    },
    [closeEmojiPicker],
  );

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
        [Crepe.Feature.TopBar]: {
          buildTopBar: (builder) => {
            builder.addGroup("emoji", "Emoji").addItem("emoji", {
              icon: emojiIcon,
              active: () => false,
              onRun: () => {
                if (emojiAnchorRef.current) {
                  closeEmojiPicker();
                  return;
                }
                const button = root
                  .querySelector(".emoji-picker-icon")
                  ?.closest("button");
                if (button) setEmojiAnchor(button);
              },
            });
            for (const group of builder.build()) {
              for (const item of group.items) {
                const tooltip = topBarTooltips[item.key];
                if (tooltip && item.icon) {
                  item.icon = item.icon.replace(
                    /<svg\b/,
                    `<svg data-tooltip="${tooltip}"`,
                  );
                }
              }
            }
          },
        },
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
    root.addEventListener("pointerover", setTopBarTitleOnHover);
    let view: EditorView | null = null;
    let disposed = false;
    const createPromise = crepe.create().then(() => {
      if (disposed) return;
      view = crepe.editor.ctx.get(editorViewCtx);
      viewRef.current = view;
      setActiveMarkdownView(view);
    });

    return () => {
      disposed = true;
      root.removeEventListener("pointerover", setTopBarTitleOnHover);
      viewRef.current = null;
      setEmojiAnchor(null);
      void createPromise.then(() => {
        if (view && getActiveMarkdownView() === view) setActiveMarkdownView(null);
        crepe.destroy();
      });
    };
    // Only recreate the editor when switching notes — `defaultValue` is
    // intentionally read just once, at mount, since it changes on every
    // keystroke via the store round-trip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  return (
    <>
      <div className="markdown-editor" ref={rootRef} />
      {emojiAnchor && (
        <EmojiPicker
          anchor={emojiAnchor}
          onPick={insertEmoji}
          onClose={closeEmojiPicker}
        />
      )}
    </>
  );
}
