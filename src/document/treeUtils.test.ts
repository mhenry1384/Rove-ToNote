import { describe, expect, it } from "vitest";
import {
  buildTree,
  computeDragMove,
  findPreviousSibling,
  flattenVisibleTree,
} from "./treeUtils";
import type { NoteMeta } from "./types";

function note(overrides: Partial<NoteMeta> & Pick<NoteMeta, "id">): NoteMeta {
  return {
    parentId: null,
    title: "Untitled",
    type: "markdown",
    content: "",
    isEncrypted: false,
    sortOrder: 0,
    createdAt: "2026-08-06T00:00:00.000Z",
    updatedAt: "2026-08-06T00:00:00.000Z",
    ...overrides,
  };
}

describe("buildTree", () => {
  it("nests children under their parent and sorts siblings by sortOrder", () => {
    const notes: NoteMeta[] = [
      note({ id: "b", title: "B", sortOrder: 2048 }),
      note({ id: "a", title: "A", sortOrder: 1024 }),
      note({ id: "a1", parentId: "a", title: "A1", sortOrder: 1024 }),
      note({ id: "a2", parentId: "a", title: "A2", sortOrder: 2048 }),
    ];

    const tree = buildTree(notes);
    expect(tree.map((n) => n.title)).toEqual(["A", "B"]);
    expect(tree[0].children.map((n) => n.title)).toEqual(["A1", "A2"]);
    expect(tree[1].children).toEqual([]);
  });

  it("treats a note whose parent is missing as a root", () => {
    const notes: NoteMeta[] = [note({ id: "orphan", parentId: "missing" })];
    const tree = buildTree(notes);
    expect(tree.map((n) => n.id)).toEqual(["orphan"]);
  });
});

describe("findPreviousSibling", () => {
  const notes: NoteMeta[] = [
    note({ id: "a", sortOrder: 1024 }),
    note({ id: "b", sortOrder: 2048 }),
    note({ id: "c", sortOrder: 3072 }),
  ];

  it("returns null for the first child", () => {
    expect(findPreviousSibling(notes, "a")).toBeNull();
  });

  it("returns the immediately preceding sibling", () => {
    expect(findPreviousSibling(notes, "b")).toBe("a");
    expect(findPreviousSibling(notes, "c")).toBe("b");
  });

  it("returns null for an unknown id", () => {
    expect(findPreviousSibling(notes, "nope")).toBeNull();
  });
});

describe("flattenVisibleTree", () => {
  it("omits children of collapsed nodes but keeps expanded ones", () => {
    const notes: NoteMeta[] = [
      note({ id: "a", sortOrder: 1024 }),
      note({ id: "a1", parentId: "a", sortOrder: 1024 }),
      note({ id: "b", sortOrder: 2048 }),
    ];
    const tree = buildTree(notes);

    expect(flattenVisibleTree(tree, () => true).map((n) => n.id)).toEqual([
      "a",
      "a1",
      "b",
    ]);
    expect(flattenVisibleTree(tree, () => false).map((n) => n.id)).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("computeDragMove", () => {
  it("reorders siblings, adopting the parent of the note now directly above", () => {
    const notes: NoteMeta[] = [
      note({ id: "a", sortOrder: 1024 }),
      note({ id: "b", sortOrder: 2048 }),
      note({ id: "c", sortOrder: 3072 }),
    ];
    const visible = flattenVisibleTree(buildTree(notes), () => true);

    expect(computeDragMove(notes, visible, "a", "c")).toEqual({
      newParentId: null,
      beforeId: "c",
      afterId: null,
    });
  });

  it("drops at the very top by adopting the parent of the note now below", () => {
    const notes: NoteMeta[] = [
      note({ id: "a", sortOrder: 1024 }),
      note({ id: "b", sortOrder: 2048 }),
      note({ id: "c", sortOrder: 3072 }),
    ];
    const visible = flattenVisibleTree(buildTree(notes), () => true);

    expect(computeDragMove(notes, visible, "c", "a")).toEqual({
      newParentId: null,
      beforeId: null,
      afterId: "a",
    });
  });

  it("reparents by dropping onto a note nested under a different parent", () => {
    const notes: NoteMeta[] = [
      note({ id: "a", sortOrder: 1024 }),
      note({ id: "b", sortOrder: 2048 }),
      note({ id: "b1", parentId: "b", sortOrder: 1024 }),
    ];
    const visible = flattenVisibleTree(buildTree(notes), () => true);

    expect(computeDragMove(notes, visible, "a", "b1")).toEqual({
      newParentId: "b",
      beforeId: "b1",
      afterId: null,
    });
  });

  it("returns null for a no-op drag (dropped on itself or an unknown id)", () => {
    const notes: NoteMeta[] = [note({ id: "a", sortOrder: 1024 })];
    const visible = flattenVisibleTree(buildTree(notes), () => true);

    expect(computeDragMove(notes, visible, "a", "a")).toBeNull();
    expect(computeDragMove(notes, visible, "a", "missing")).toBeNull();
  });
});
