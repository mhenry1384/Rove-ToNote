import { describe, expect, it } from "vitest";
import { appendSortOrder, betweenSortOrder } from "./sortOrder";

describe("appendSortOrder", () => {
  it("returns a base value for an empty sibling list", () => {
    expect(appendSortOrder([])).toBe(1024);
  });

  it("appends after the largest existing sibling", () => {
    expect(appendSortOrder([1024, 2048, 512])).toBe(3072);
  });
});

describe("betweenSortOrder", () => {
  it("returns a base value when there are no neighbors", () => {
    expect(betweenSortOrder(null, null)).toBe(1024);
  });

  it("halves the gap when inserting before the first item", () => {
    expect(betweenSortOrder(null, 1024)).toBe(512);
  });

  it("appends a gap when inserting after the last item", () => {
    expect(betweenSortOrder(1024, null)).toBe(2048);
  });

  it("averages when inserting between two siblings", () => {
    expect(betweenSortOrder(1024, 2048)).toBe(1536);
  });

  it("does not collide across repeated inserts into the same gap", () => {
    let low = 1024;
    const high = 2048;
    const seen = new Set<number>([low, high]);
    for (let i = 0; i < 10; i++) {
      const mid = betweenSortOrder(low, high);
      expect(seen.has(mid)).toBe(false);
      seen.add(mid);
      low = mid;
    }
  });
});
