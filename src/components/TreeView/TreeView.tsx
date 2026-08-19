import { useEffect, useMemo, useState } from "react";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useDocumentStore } from "../../document/documentStore";
import { usePrefsStore } from "../../stores/usePrefsStore";
import { useVaultStore } from "../../stores/useVaultStore";
import { useTreeFilterStore } from "../../stores/useTreeFilterStore";
import { docKey } from "../../document/documentSource";
import { buildTree, computeDragMove, flattenVisibleTree, type TreeNode } from "../../document/treeUtils";
import { noteMatchesQuery } from "../../document/noteSearch";
import { decryptString, parseEnvelope } from "../../document/crypto/vaultCrypto";
import { NoteTreeItem } from "./NoteTreeItem";
import { TreeToolbar } from "./TreeToolbar";
import { TreeFilterBox } from "./TreeFilterBox";
import { RecentlyDeleted } from "./RecentlyDeleted";

export function TreeView() {
  const notes = useDocumentStore((s) => s.doc?.notes);
  const source = useDocumentStore((s) => s.source);
  const key = source ? docKey(source) : null;
  const expandState = usePrefsStore((s) =>
    key ? s.prefs.treeExpandState[key] : undefined,
  );
  const isUnlocked = useVaultStore((s) => s.isUnlocked);
  const vaultKey = useVaultStore((s) => s.key);
  const query = useTreeFilterStore((s) => s.query).trim();
  const isFiltering = query.length > 0;

  const liveNotes = useMemo(() => notes ?? [], [notes]);
  const tree = useMemo(() => buildTree(liveNotes), [liveNotes]);

  // Decrypted plaintext for encrypted notes, cached by `id:content` so an
  // edit or a re-encrypt naturally invalidates the entry. Only populated
  // while there's an active search and the vault is unlocked — the vault
  // key can already decrypt any note on demand, but there's no reason to
  // do that work until the user actually searches.
  const [decrypted, setDecrypted] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (!isFiltering || !isUnlocked || !vaultKey) return;
    const toDecrypt = liveNotes.filter(
      (n) => n.isEncrypted && !decrypted.has(`${n.id}:${n.content}`),
    );
    if (toDecrypt.length === 0) return;
    let cancelled = false;
    void (async () => {
      const entries: [string, string][] = [];
      for (const n of toDecrypt) {
        try {
          const plaintext = await decryptString(vaultKey, parseEnvelope(n.content));
          entries.push([`${n.id}:${n.content}`, plaintext]);
        } catch {
          // Wrong key for this note (shouldn't happen within one vault) —
          // it just won't match on content, title search still applies.
        }
      }
      if (!cancelled && entries.length > 0) {
        setDecrypted((prev) => new Map([...prev, ...entries]));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isFiltering, isUnlocked, vaultKey, liveNotes, decrypted]);

  // While filtering, folders and hierarchy stop being meaningful — just show
  // every matching note/to-do list as a flat list, wherever it lives.
  const filteredTree = useMemo(() => {
    if (!isFiltering) return tree;
    return liveNotes
      .filter((n) => n.type !== "folder")
      .filter((n) => {
        const plaintextContent = n.isEncrypted
          ? isUnlocked
            ? decrypted.get(`${n.id}:${n.content}`)
            : undefined
          : n.content;
        return noteMatchesQuery(n, query, plaintextContent);
      })
      .map((n): TreeNode => ({ ...n, children: [] }));
  }, [tree, isFiltering, query, decrypted, isUnlocked, liveNotes]);

  const visible = useMemo(() => {
    const isExpanded = (id: string) =>
      isFiltering ? true : key ? usePrefsStore.getState().isExpanded(key, id) : true;
    return flattenVisibleTree(filteredTree, isExpanded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredTree, expandState, key, isFiltering]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over, delta } = event;
    if (!over) return;
    const currentNotes = useDocumentStore.getState().doc?.notes;
    if (!currentNotes) return;
    const move = computeDragMove(
      currentNotes,
      visible,
      String(active.id),
      String(over.id),
      delta.x,
    );
    if (move) {
      useDocumentStore
        .getState()
        .moveNote(String(active.id), move.newParentId, move.beforeId, move.afterId);
    }
  }

  return (
    <div className="tree-view">
      <TreeFilterBox />
      <TreeToolbar />
      <div className="tree-view__list" role="tree">
        {filteredTree.length === 0 ? (
          <p className="tree-view__empty">
            {isFiltering ? `No notes match "${query}".` : "No notes yet — add one above."}
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={visible.map((v) => v.id)}
              strategy={verticalListSortingStrategy}
            >
              {filteredTree.map((node) => (
                <NoteTreeItem key={node.id} node={node} depth={0} isFiltering={isFiltering} />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
      <RecentlyDeleted />
    </div>
  );
}
