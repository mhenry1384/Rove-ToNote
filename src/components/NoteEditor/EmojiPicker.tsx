import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { usePrefsStore } from "../../stores/usePrefsStore";
import { loadEmojiGroups, searchEmojis, type EmojiEntry, type EmojiGroup } from "./emojiData";

const COLUMNS = 9;
const PICKER_WIDTH = 340;
const VIEWPORT_MARGIN = 8;

interface EmojiPickerProps {
  /** The toolbar button the picker drops down from. Clicks on it are left
   * to the button itself so it can toggle the picker closed. */
  anchor: HTMLElement;
  onPick: (emoji: string) => void;
  onClose: () => void;
}

interface Section {
  title: string;
  emojis: EmojiEntry[];
}

/** Searchable emoji grid shown under the markdown editor's emoji toolbar
 * button. With no query it lists recently used emoji followed by every
 * category; typing filters to matching names/keywords/categories. */
export function EmojiPicker({ anchor, onPick, onClose }: EmojiPickerProps) {
  const [groups, setGroups] = useState<EmojiGroup[] | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const recentEmojis = usePrefsStore((s) => s.prefs.recentEmojis);
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollToActiveRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void loadEmojiGroups().then((g) => {
      if (!cancelled) setGroups(g);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useLayoutEffect(() => {
    const rect = anchor.getBoundingClientRect();
    const maxLeft = window.innerWidth - PICKER_WIDTH - VIEWPORT_MARGIN;
    setPosition({
      top: rect.bottom + 4,
      left: Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft)),
    });
  }, [anchor]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || anchor.contains(target)) return;
      onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [anchor, onClose]);

  const sections = useMemo<Section[]>(() => {
    if (!groups) return [];
    if (query.trim()) {
      return [{ title: "Search results", emojis: searchEmojis(groups, query) }];
    }
    const byEmoji = new Map(groups.flatMap((g) => g.emojis.map((e) => [e.emoji, e])));
    const recent = recentEmojis
      .map((emoji) => byEmoji.get(emoji))
      .filter((e): e is EmojiEntry => !!e);
    return [
      ...(recent.length > 0 ? [{ title: "Recently used", emojis: recent }] : []),
      ...groups.map((g) => ({ title: g.name, emojis: g.emojis })),
    ];
  }, [groups, query, recentEmojis]);

  const flat = useMemo(() => sections.flatMap((s) => s.emojis), [sections]);
  const active = flat[activeIndex];

  useEffect(() => {
    setActiveIndex(0);
    gridRef.current?.scrollTo({ top: 0 });
  }, [query]);

  // Only follow the highlight with the scroll position for keyboard moves —
  // hovering a half-visible emoji shouldn't yank the grid around.
  useEffect(() => {
    if (!scrollToActiveRef.current) return;
    scrollToActiveRef.current = false;
    gridRef.current
      ?.querySelector(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const pick = (entry: EmojiEntry) => {
    void usePrefsStore.getState().addRecentEmoji(entry.emoji);
    onPick(entry.emoji);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const move = (delta: number) => {
      e.preventDefault();
      scrollToActiveRef.current = true;
      setActiveIndex((i) => Math.max(0, Math.min(flat.length - 1, i + delta)));
    };
    switch (e.key) {
      case "Escape":
        e.preventDefault();
        onClose();
        break;
      case "Enter":
        e.preventDefault();
        if (active) pick(active);
        break;
      case "ArrowRight":
        move(1);
        break;
      case "ArrowLeft":
        move(-1);
        break;
      case "ArrowDown":
        move(COLUMNS);
        break;
      case "ArrowUp":
        move(-COLUMNS);
        break;
    }
  };

  let index = 0;
  return createPortal(
    <div
      ref={rootRef}
      className="emoji-picker"
      style={{ top: position.top, left: position.left, width: PICKER_WIDTH }}
      onKeyDown={onKeyDown}
    >
      <input
        className="emoji-picker__search"
        type="text"
        placeholder="Search emoji (e.g. smiley, heart, cat)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        spellCheck={false}
      />
      <div className="emoji-picker__grid-scroll" ref={gridRef}>
        {!groups && <div className="emoji-picker__empty">Loading…</div>}
        {groups && flat.length === 0 && (
          <div className="emoji-picker__empty">No emoji match “{query}”</div>
        )}
        {sections.map(
          (section) =>
            section.emojis.length > 0 && (
              <div key={section.title}>
                <div className="emoji-picker__section-title">{section.title}</div>
                <div
                  className="emoji-picker__grid"
                  style={{ gridTemplateColumns: `repeat(${COLUMNS}, 1fr)` }}
                >
                  {section.emojis.map((entry) => {
                    const i = index++;
                    return (
                      <button
                        key={entry.emoji}
                        type="button"
                        data-index={i}
                        className={
                          "emoji-picker__emoji" +
                          (i === activeIndex ? " emoji-picker__emoji--active" : "")
                        }
                        title={entry.name}
                        onMouseEnter={() => setActiveIndex(i)}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => pick(entry)}
                      >
                        {entry.emoji}
                      </button>
                    );
                  })}
                </div>
              </div>
            ),
        )}
      </div>
      <div className="emoji-picker__footer">
        {active ? (
          <>
            <span className="emoji-picker__footer-emoji">{active.emoji}</span>
            <span className="emoji-picker__footer-name">{active.name}</span>
          </>
        ) : (
          <span className="emoji-picker__footer-name">&nbsp;</span>
        )}
      </div>
    </div>,
    document.body,
  );
}
