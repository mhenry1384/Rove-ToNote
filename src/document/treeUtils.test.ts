import { describe, expect, it } from "vitest";
import {
  buildTree,
  collectDeletionSubtreeIds,
  computeDragMove,
  findPreviousSibling,
  flattenVisibleTree,
  getDeletionRoots,
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

  it("skips soft-deleted siblings", () => {
    const withDeleted: NoteMeta[] = [
      note({ id: "a", sortOrder: 1024 }),
      note({ id: "b", sortOrder: 2048, deletedAt: "2026-08-06T00:00:00.000Z" }),
      note({ id: "c", sortOrder: 3072 }),
    ];
    expect(findPreviousSibling(withDeleted, "c")).toBe("a");
  });
});

describe("getDeletionRoots", () => {
  it("returns only the top of each soft-deleted subtree", () => {
    const notes: NoteMeta[] = [
      note({ id: "a" }),
      note({ id: "b", deletedAt: "2026-08-06T00:00:00.000Z" }),
      note({ id: "b1", parentId: "b", deletedAt: "2026-08-06T00:00:00.000Z" }),
    ];
    expect(getDeletionRoots(notes).map((n) => n.id)).toEqual(["b"]);
  });

  it("treats an independently-deleted descendant (different timestamp) as its own root", () => {
    const notes: NoteMeta[] = [
      note({ id: "a", deletedAt: "2026-08-06T00:00:00.000Z" }),
      note({ id: "a1", parentId: "a", deletedAt: "2026-08-05T00:00:00.000Z" }),
    ];
    expect(getDeletionRoots(notes).map((n) => n.id).sort()).toEqual(["a", "a1"]);
  });

  it("ignores live notes", () => {
    const notes: NoteMeta[] = [note({ id: "a" })];
    expect(getDeletionRoots(notes)).toEqual([]);
  });
});

describe("collectDeletionSubtreeIds", () => {
  it("collects the root and descendants sharing its exact deletedAt", () => {
    const ts = "2026-08-06T00:00:00.000Z";
    const notes: NoteMeta[] = [
      note({ id: "a", deletedAt: ts }),
      note({ id: "a1", parentId: "a", deletedAt: ts }),
      note({ id: "a2", parentId: "a", deletedAt: "2026-08-05T00:00:00.000Z" }),
    ];
    expect(collectDeletionSubtreeIds(notes, "a")).toEqual(new Set(["a", "a1"]));
  });

  it("returns an empty set for a live note", () => {
    const notes: NoteMeta[] = [note({ id: "a" })];
    expect(collectDeletionSubtreeIds(notes, "a")).toEqual(new Set());
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

  it("nests under the note now directly above when dragged right past the threshold", () => {
    const notes: NoteMeta[] = [
      note({ id: "a", sortOrder: 1024 }),
      note({ id: "b", sortOrder: 2048 }),
      note({ id: "c", sortOrder: 3072 }),
    ];
    const visible = flattenVisibleTree(buildTree(notes), () => true);

    expect(computeDragMove(notes, visible, "a", "c", 30)).toEqual({
      newParentId: "c",
      beforeId: null,
      afterId: null,
    });
  });

  it("promotes to the parent's level when dragged left, landing after the former parent rather than at the end", () => {
    const notes: NoteMeta[] = [
      note({ id: "a", sortOrder: 1024 }),
      note({ id: "a1", parentId: "a", sortOrder: 1024 }),
      note({ id: "a2", parentId: "a", sortOrder: 2048 }),
      note({ id: "a3", parentId: "a", sortOrder: 3072 }),
      note({ id: "b", sortOrder: 2048 }),
    ];
    const visible = flattenVisibleTree(buildTree(notes), () => true);

    expect(computeDragMove(notes, visible, "a3", "a2", -30)).toEqual({
      newParentId: null,
      beforeId: "a",
      afterId: "b",
    });
  });

  it("indents in place when nudged right without crossing into another row (over === active)", () => {
    const notes: NoteMeta[] = [
      note({ id: "a", sortOrder: 1024 }),
      note({ id: "b", sortOrder: 2048 }),
    ];
    const visible = flattenVisibleTree(buildTree(notes), () => true);

    expect(computeDragMove(notes, visible, "b", "b", 30)).toEqual({
      newParentId: "a",
      beforeId: null,
      afterId: null,
    });
  });

  it("outdents in place when nudged left without crossing into another row (over === active)", () => {
    const notes: NoteMeta[] = [
      note({ id: "a", sortOrder: 1024 }),
      note({ id: "a1", parentId: "a", sortOrder: 1024 }),
      note({ id: "b", sortOrder: 2048 }),
    ];
    const visible = flattenVisibleTree(buildTree(notes), () => true);

    expect(computeDragMove(notes, visible, "a1", "a1", -30)).toEqual({
      newParentId: null,
      beforeId: "a",
      afterId: "b",
    });
  });

  it("is a no-op when nudged sideways without crossing rows and below the threshold", () => {
    const notes: NoteMeta[] = [
      note({ id: "a", sortOrder: 1024 }),
      note({ id: "b", sortOrder: 2048 }),
    ];
    const visible = flattenVisibleTree(buildTree(notes), () => true);

    expect(computeDragMove(notes, visible, "b", "b", 5)).toBeNull();
  });
});
