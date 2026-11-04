import { describe, expect, it } from "vitest";
import byEmoji from "unicode-emoji-json/data-by-emoji.json";
import keywords from "emojilib";
import { buildEmojiGroups, searchEmojis } from "./emojiData";

const groups = buildEmojiGroups(byEmoji, keywords);
const search = (q: string) => searchEmojis(groups, q).map((e) => e.emoji);

describe("searchEmojis", () => {
  it("matches a category name, so 'smiley' returns the smileys", () => {
    const results = search("smiley");
    expect(results).toContain("😀");
    expect(results).toContain("😭");
    expect(results.length).toBeGreaterThan(100);
  });

  it("requires every query word to match", () => {
    const results = search("red heart");
    expect(results).toContain("❤️");
    expect(results).not.toContain("💙");
  });

  it("matches emojilib keywords by prefix", () => {
    expect(search("thumbs")).toContain("👍");
    expect(search("kitt")).toContain("🐱");
  });

  it("returns nothing for an empty query", () => {
    expect(search("  ")).toEqual([]);
  });
});
