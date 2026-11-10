import { Fragment, type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

export function containsUrl(text: string): boolean {
  return text.search(URL_PATTERN) !== -1;
}

/** Splits text into plain text and links that open in the default browser.
 * Trailing punctuation is left out of the link so a URL at the end of a
 * sentence still works. */
export function linkify(text: string, linkClassName: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0].replace(/[.,;:!?)\]}]+$/, "");
    const start = match.index;
    if (start > last) parts.push(text.slice(last, start));
    const href = raw.toLowerCase().startsWith("www.") ? `https://${raw}` : raw;
    parts.push(
      <a
        href={href}
        className={linkClassName}
        // Keep the click from moving focus into the surrounding editor, which
        // would swap this view for a textarea before the click lands.
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openUrl(href).catch((err) => console.error("Failed to open URL", err));
        }}
      >
        {raw}
      </a>,
    );
    last = start + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>);
}
