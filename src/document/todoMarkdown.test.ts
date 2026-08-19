import { describe, expect, it } from "vitest";
import {
  createEmptyTodoDoc,
  parseTodoMarkdown,
  pruneCompletedItems,
  serializeTodoMarkdown,
  sortItemsForDisplay,
  type TodoDoc,
  type TodoItem,
  type Priority,
} from "./todoMarkdown";

describe("todoMarkdown round trip: parse(serialize(x)) === x", () => {
  it("round-trips an empty list", () => {
    const doc = createEmptyTodoDoc();
    expect(parseTodoMarkdown(serializeTodoMarkdown(doc))).toEqual(doc);
  });

  it("round-trips a zero-note item for each priority and checked state", () => {
    const priorities: Priority[] = ["high", "medium", "low", "none"];
    const doc: TodoDoc = {
      sortMode: "manual",
      items: priorities.map((priority, i) => ({
        id: `item-${i}`,
        text: `Task ${priority}`,
        checked: i % 2 === 0,
        priority,
        notes: [],
      })),
    };
    expect(parseTodoMarkdown(serializeTodoMarkdown(doc))).toEqual(doc);
  });

  it("round-trips a multi-note item, including a multi-line note", () => {
    const doc: TodoDoc = {
      sortMode: "manual",
      items: [
        {
          id: "item-1",
          text: "Buy milk",
          checked: false,
          priority: "high",
          notes: [
            { id: "note-1", text: "Also get oat milk" },
            {
              id: "note-2",
              text: "Check for a coupon\nAnd bring the reusable bag",
            },
          ],
        },
      ],
    };
    expect(parseTodoMarkdown(serializeTodoMarkdown(doc))).toEqual(doc);
  });

  it("round-trips a completed item's completedAt timestamp", () => {
    const doc: TodoDoc = {
      sortMode: "manual",
      items: [
        {
          id: "item-1",
          text: "Done thing",
          checked: true,
          priority: "none",
          notes: [],
          completedAt: "2026-08-06T00:00:00.000Z",
        },
      ],
    };
    expect(parseTodoMarkdown(serializeTodoMarkdown(doc))).toEqual(doc);
  });

  it("round-trips each sort mode", () => {
    for (const sortMode of ["manual", "priority", "alphabetical"] as const) {
      const doc: TodoDoc = {
        sortMode,
        items: [
          { id: "a", text: "A", checked: false, priority: "none", notes: [] },
        ],
      };
      expect(parseTodoMarkdown(serializeTodoMarkdown(doc))).toEqual(doc);
    }
  });
});

describe("todoMarkdown round trip: serialize(parse(fixture)) === fixture", () => {
  it("matches a canonical hand-written fixture", () => {
    const fixture = [
      '<!-- tonote:todo meta v1 sortMode="manual" -->',
      "",
      '- [ ] Buy milk <!-- tonote:item id="n1a2b3c4" priority="high" -->',
      '  - <!-- tonote:note id="k9x2p1q5" --> Also get oat milk if the regular is out',
      '  - <!-- tonote:note id="q3r7s5t2" --> Check for a discount coupon in the app',
      '- [x] Pay rent <!-- tonote:item id="d4e5f6g7" priority="none" -->',
      '- [ ] Call plumber <!-- tonote:item id="g7h8i9j0" priority="medium" -->',
      '  - <!-- tonote:note id="m2n4o6p8" --> Ask about the leak in the basement',
    ].join("\n");
    expect(serializeTodoMarkdown(parseTodoMarkdown(fixture))).toBe(fixture);
  });

  it("matches a fixture for an empty list", () => {
    const fixture = '<!-- tonote:todo meta v1 sortMode="manual" -->\n';
    expect(serializeTodoMarkdown(parseTodoMarkdown(fixture))).toBe(fixture);
  });
});

describe("sortItemsForDisplay", () => {
  const items: TodoDoc["items"] = [
    { id: "1", text: "Banana", checked: false, priority: "low", notes: [] },
    { id: "2", text: "Apple", checked: false, priority: "high", notes: [] },
    { id: "3", text: "Cherry", checked: false, priority: "medium", notes: [] },
  ];

  it("leaves manual order untouched (when nothing is checked)", () => {
    expect(sortItemsForDisplay(items, "manual")).toEqual(items);
  });

  it("does not mutate the input array for priority/alphabetical modes", () => {
    const copy = [...items];
    sortItemsForDisplay(items, "priority");
    expect(items).toEqual(copy);
  });

  it("sorts by priority rank, high first", () => {
    const sorted = sortItemsForDisplay(items, "priority");
    expect(sorted.map((i) => i.text)).toEqual(["Apple", "Cherry", "Banana"]);
  });

  it("sorts alphabetically", () => {
    const sorted = sortItemsForDisplay(items, "alphabetical");
    expect(sorted.map((i) => i.text)).toEqual(["Apple", "Banana", "Cherry"]);
  });

  it("moves checked items after unchecked ones, regardless of mode", () => {
    const withChecked: TodoDoc["items"] = [
      { id: "1", text: "Zebra", checked: true, priority: "none", notes: [] },
      { id: "2", text: "Banana", checked: false, priority: "none", notes: [] },
      { id: "3", text: "Apple", checked: true, priority: "none", notes: [] },
      { id: "4", text: "Cherry", checked: false, priority: "none", notes: [] },
    ];
    expect(sortItemsForDisplay(withChecked, "manual").map((i) => i.text)).toEqual([
      "Banana",
      "Cherry",
      "Zebra",
      "Apple",
    ]);
    expect(sortItemsForDisplay(withChecked, "alphabetical").map((i) => i.text)).toEqual([
      "Banana",
      "Cherry",
      "Apple",
      "Zebra",
    ]);
  });
});

describe("pruneCompletedItems", () => {
  function completedItem(id: string, completedAt: string): TodoItem {
    return { id, text: id, checked: true, priority: "none", notes: [], completedAt };
  }

  it("keeps everything when at or under the cap", () => {
    const items = [completedItem("1", "2026-08-01T00:00:00.000Z")];
    expect(pruneCompletedItems(items, 10)).toBe(items);
  });

  it("drops the oldest-completed items beyond the cap", () => {
    const items = [
      completedItem("old", "2026-08-01T00:00:00.000Z"),
      completedItem("mid", "2026-08-02T00:00:00.000Z"),
      completedItem("new", "2026-08-03T00:00:00.000Z"),
    ];
    const pruned = pruneCompletedItems(items, 2);
    expect(pruned.map((i) => i.id)).toEqual(["mid", "new"]);
  });

  it("never touches unchecked items", () => {
    const items: TodoItem[] = [
      { id: "active", text: "active", checked: false, priority: "none", notes: [] },
      completedItem("old", "2026-08-01T00:00:00.000Z"),
      completedItem("new", "2026-08-02T00:00:00.000Z"),
    ];
    const pruned = pruneCompletedItems(items, 1);
    expect(pruned.map((i) => i.id)).toEqual(["active", "new"]);
  });
});
