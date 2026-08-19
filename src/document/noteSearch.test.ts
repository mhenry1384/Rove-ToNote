import { describe, expect, it } from "vitest";
import { noteMatchesQuery } from "./noteSearch";

describe("noteMatchesQuery", () => {
  it("matches on title, case-insensitively", () => {
    expect(noteMatchesQuery({ title: "Grocery List" }, "grocery", undefined)).toBe(true);
  });

  it("matches on plaintext content when provided", () => {
    expect(noteMatchesQuery({ title: "Untitled" }, "milk", "buy milk and eggs")).toBe(true);
  });

  it("does not match content when plaintextContent is undefined", () => {
    expect(noteMatchesQuery({ title: "Untitled" }, "milk", undefined)).toBe(false);
  });

  it("returns false when the query is in neither title nor content", () => {
    expect(noteMatchesQuery({ title: "Untitled" }, "milk", "buy eggs")).toBe(false);
  });
});
