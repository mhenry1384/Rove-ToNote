import { useEffect, type RefObject } from "react";

/** Styles a hidden mirror div must share with the textarea so its text wraps
 * onto the same lines. */
const mirroredProps = [
  "boxSizing",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderStyle",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontVariant",
  "fontWeight",
  "fontStretch",
  "letterSpacing",
  "lineHeight",
  "textIndent",
  "textTransform",
  "wordSpacing",
  "tabSize",
] as const;

/**
 * Highlights the visual line holding a textarea's caret, matching the
 * Notes-card highlight (cursorLinePlugin.ts). A textarea can't style part of
 * its text, so this measures the caret line with a hidden mirror div and
 * publishes it as `--cursor-line-top` / `--cursor-line-height` custom
 * properties, which CSS paints as a scrolling (`background-attachment:
 * local`) gradient band. `--cursor-line-height` is 0 while there's a range
 * selection.
 */
export function useTextareaCursorLine(
  ref: RefObject<HTMLTextAreaElement | null>,
  /** The textarea's value, so a value set from outside (no input event)
   * re-measures too. */
  value: string,
) {
  useEffect(() => {
    const textarea = ref.current;
    if (!textarea) return;

    const mirror = document.createElement("div");
    mirror.setAttribute("aria-hidden", "true");
    Object.assign(mirror.style, {
      position: "absolute",
      top: "0",
      left: "-9999px",
      visibility: "hidden",
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word",
      overflow: "hidden",
    });
    const marker = document.createElement("span");
    document.body.appendChild(mirror);

    let frame = 0;
    const measure = () => {
      const { selectionStart, selectionEnd, value } = textarea;
      if (selectionStart !== selectionEnd) {
        textarea.style.setProperty("--cursor-line-height", "0px");
        return;
      }
      const style = getComputedStyle(textarea);
      for (const prop of mirroredProps) mirror.style[prop] = style[prop];
      // clientWidth excludes the scrollbar, which narrows the wrap width.
      const borderX = parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth);
      mirror.style.boxSizing = "border-box";
      mirror.style.width = `${textarea.clientWidth + borderX}px`;

      mirror.textContent = value.slice(0, selectionStart);
      // The marker holds the rest of the text (not just a placeholder) so
      // the word under the caret wraps exactly as it does in the textarea.
      marker.textContent = value.slice(selectionStart) || ".";
      mirror.appendChild(marker);

      // offsetTop is measured from the mirror's padding edge, the same origin
      // the textarea's padding-box background uses, but to the marker's
      // glyph box, which sits centred in the (taller) line box.
      const glyphHeight = marker.getClientRects()[0]?.height ?? marker.offsetHeight;
      const lineHeight = parseFloat(style.lineHeight) || glyphHeight;
      const top = marker.offsetTop - (lineHeight - glyphHeight) / 2;
      textarea.style.setProperty("--cursor-line-top", `${top}px`);
      textarea.style.setProperty("--cursor-line-height", `${lineHeight}px`);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    const events = ["input", "select", "keydown", "keyup", "mousedown", "mouseup", "focus"];
    for (const name of events) textarea.addEventListener(name, schedule);
    document.addEventListener("selectionchange", schedule);
    const resize = new ResizeObserver(schedule);
    resize.observe(textarea);
    schedule();

    return () => {
      cancelAnimationFrame(frame);
      for (const name of events) textarea.removeEventListener(name, schedule);
      document.removeEventListener("selectionchange", schedule);
      resize.disconnect();
      mirror.remove();
    };
  }, [ref, value]);
}
