import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { DocumentSource } from "./documentSource";

/**
 * Small local-only app state, kept separate from the portable `.tonote`
 * document so it doesn't sync/conflict across machines and doesn't pollute
 * the shared file with pure view state.
 */
export interface Prefs {
  lastOpenedSource: DocumentSource | null;
  windowBounds?: { width: number; height: number; x: number; y: number };
  /** docKey(source) -> noteId -> expanded */
  treeExpandState: Record<string, Record<string, boolean>>;
  /** Most-recently-used first, capped at MAX_RECENT_BACKGROUND_IMAGE_URLS. */
  recentBackgroundImageUrls: string[];
}

export const MAX_RECENT_BACKGROUND_IMAGE_URLS = 15;

function defaultPrefs(): Prefs {
  return { lastOpenedSource: null, treeExpandState: {}, recentBackgroundImageUrls: [] };
}

let prefsFilePathPromise: Promise<string> | null = null;

async function getPrefsFilePath(): Promise<string> {
  if (!prefsFilePathPromise) {
    prefsFilePathPromise = (async () => {
      const dir = await appDataDir();
      if (!(await exists(dir))) {
        await mkdir(dir, { recursive: true });
      }
      return join(dir, "prefs.json");
    })();
  }
  return prefsFilePathPromise;
}

export async function loadPrefs(): Promise<Prefs> {
  const path = await getPrefsFilePath();
  if (!(await exists(path))) {
    return defaultPrefs();
  }
  try {
    const raw = await readTextFile(path);
    const parsed = JSON.parse(raw) as Partial<Prefs> & { lastOpenedFilePath?: string | null };
    const merged = { ...defaultPrefs(), ...parsed };
    // Migrate the pre-Drive-support shape: a bare local path with no
    // lastOpenedSource yet.
    if (!merged.lastOpenedSource && typeof parsed.lastOpenedFilePath === "string") {
      merged.lastOpenedSource = { kind: "local", path: parsed.lastOpenedFilePath };
    }
    return merged;
  } catch {
    // Corrupt local prefs are not worth failing the app over — start fresh.
    return defaultPrefs();
  }
}

export async function savePrefs(prefs: Prefs): Promise<void> {
  const path = await getPrefsFilePath();
  await writeTextFile(path, JSON.stringify(prefs, null, 2));
}

export function isNoteExpanded(
  prefs: Prefs,
  docKey: string,
  noteId: string,
): boolean {
  return prefs.treeExpandState[docKey]?.[noteId] ?? true;
}

export function withNoteExpanded(
  prefs: Prefs,
  docKey: string,
  noteId: string,
  expanded: boolean,
): Prefs {
  return {
    ...prefs,
    treeExpandState: {
      ...prefs.treeExpandState,
      [docKey]: {
        ...prefs.treeExpandState[docKey],
        [noteId]: expanded,
      },
    },
  };
}

/** Moves `url` to the front of the recent-background-image list (adding it
 * if new), deduped, capped at MAX_RECENT_BACKGROUND_IMAGE_URLS. */
export function withRecentBackgroundImageUrl(prefs: Prefs, url: string): Prefs {
  const deduped = prefs.recentBackgroundImageUrls.filter((u) => u !== url);
  return {
    ...prefs,
    recentBackgroundImageUrls: [url, ...deduped].slice(0, MAX_RECENT_BACKGROUND_IMAGE_URLS),
  };
}

export function withoutRecentBackgroundImageUrl(prefs: Prefs, url: string): Prefs {
  return {
    ...prefs,
    recentBackgroundImageUrls: prefs.recentBackgroundImageUrls.filter((u) => u !== url),
  };
}
