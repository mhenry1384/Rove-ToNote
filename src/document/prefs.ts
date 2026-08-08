import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";

/**
 * Small local-only app state, kept separate from the portable `.tonote`
 * document so it doesn't sync/conflict across machines and doesn't pollute
 * the shared file with pure view state.
 */
export interface Prefs {
  lastOpenedFilePath: string | null;
  windowBounds?: { width: number; height: number; x: number; y: number };
  /** filePath -> noteId -> expanded */
  treeExpandState: Record<string, Record<string, boolean>>;
}

function defaultPrefs(): Prefs {
  return { lastOpenedFilePath: null, treeExpandState: {} };
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
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return { ...defaultPrefs(), ...parsed };
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
  filePath: string,
  noteId: string,
): boolean {
  return prefs.treeExpandState[filePath]?.[noteId] ?? true;
}

export function withNoteExpanded(
  prefs: Prefs,
  filePath: string,
  noteId: string,
  expanded: boolean,
): Prefs {
  return {
    ...prefs,
    treeExpandState: {
      ...prefs.treeExpandState,
      [filePath]: {
        ...prefs.treeExpandState[filePath],
        [noteId]: expanded,
      },
    },
  };
}
