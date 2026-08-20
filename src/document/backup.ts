import { appDataDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, readDir, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { serializeDocument } from "./fileIO";
import { displayName, docKey, type DocumentSource } from "./documentSource";
import type { ToNoteDocument } from "./types";

/** How many backups to keep per document — oldest are pruned on each write. */
const MAX_BACKUPS_PER_DOCUMENT = 20;

let backupsRootDirPromise: Promise<string> | null = null;

async function getBackupsRootDir(): Promise<string> {
  if (!backupsRootDirPromise) {
    backupsRootDirPromise = (async () => {
      const dir = await appDataDir();
      return join(dir, "backups");
    })();
  }
  return backupsRootDirPromise;
}

/** Short, deterministic, filesystem-safe hash — just enough to disambiguate
 * same-named documents from different folders/Drive accounts. */
function shortHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

function sanitizeFileNamePart(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_");
}

function baseNameWithoutExtension(source: DocumentSource): string {
  const name = displayName(source);
  const lastSegment = name.split(/[/\\]/).pop() ?? name;
  return sanitizeFileNamePart(lastSegment.replace(/\.tonote$/i, ""));
}

async function getBackupsDirForSource(source: DocumentSource): Promise<string> {
  const root = await getBackupsRootDir();
  const slug = `${baseNameWithoutExtension(source)}-${shortHash(docKey(source))}`;
  const dir = await join(root, slug);
  if (!(await exists(dir))) {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

function timestampForFileName(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

const BACKUP_FILE_PATTERN = /^(.*)\.(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}-Z)\.tonote$/;

function parseTimestampFromFileName(fileName: string): Date | null {
  const match = BACKUP_FILE_PATTERN.exec(fileName);
  if (!match) return null;
  // Reverse timestampForFileName's substitutions back to a valid ISO string.
  const iso = match[2].replace(
    /^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})-Z$/,
    "$1T$2:$3:$4.$5Z",
  );
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function pruneBackups(dir: string): Promise<void> {
  const entries = await readDir(dir);
  const backupFiles = entries.filter((e) => e.isFile && BACKUP_FILE_PATTERN.test(e.name));
  backupFiles.sort((a, b) => (a.name < b.name ? 1 : -1));
  const toRemove = backupFiles.slice(MAX_BACKUPS_PER_DOCUMENT);
  for (const entry of toRemove) {
    await remove(await join(dir, entry.name));
  }
}

/** Writes a timestamped snapshot of `doc` to the app data folder's backups
 * directory for `source`, then prunes down to the newest MAX_BACKUPS_PER_DOCUMENT. */
export async function writeBackup(source: DocumentSource, doc: ToNoteDocument): Promise<void> {
  const dir = await getBackupsDirForSource(source);
  const fileName = `${baseNameWithoutExtension(source)}.${timestampForFileName(new Date())}.tonote`;
  await writeTextFile(await join(dir, fileName), serializeDocument(doc));
  await pruneBackups(dir);
}

export interface BackupEntry {
  path: string;
  createdAt: Date;
}

/** Lists a document's backups, newest first. */
export async function listBackups(source: DocumentSource): Promise<BackupEntry[]> {
  const dir = await getBackupsDirForSource(source);
  const entries = await readDir(dir);
  const backups: BackupEntry[] = [];
  for (const entry of entries) {
    if (!entry.isFile) continue;
    const createdAt = parseTimestampFromFileName(entry.name);
    if (!createdAt) continue;
    backups.push({ path: await join(dir, entry.name), createdAt });
  }
  backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return backups;
}

/** True if `path` lives under the backups root — used to tell a backup
 * that's been opened directly from an ordinary document, so opening a
 * backup never itself gets backed up. */
export async function isBackupPath(path: string): Promise<boolean> {
  const root = await getBackupsRootDir();
  const normalize = (p: string) => p.replace(/\\/g, "/").toLowerCase();
  return normalize(path).startsWith(normalize(root) + "/");
}

/** Writes a backup for the currently-open document if it changed since the
 * last one and isn't itself a backup file. No-ops otherwise — safe to call
 * unconditionally whenever a document is about to be closed/switched, or on
 * the idle-backup timer. */
export async function backupIfNeeded(
  source: DocumentSource | null,
  doc: ToNoteDocument | null,
  changedSinceBackup: boolean,
): Promise<boolean> {
  if (!source || !doc || !changedSinceBackup) return false;
  if (source.kind === "local" && (await isBackupPath(source.path))) return false;
  await writeBackup(source, doc);
  return true;
}
