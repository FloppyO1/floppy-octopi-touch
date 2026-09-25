import { localThumbnailUrl } from '../api/agent';
import type { FileEntry, FileOrigin } from '../api/types';

export const SORT_KEYS = ['name', 'date', 'size'] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = 'asc' | 'desc';

/** Extensions OctoPrint (and the agent) treat as printable G-code. */
const GCODE = /\.(gcode|gco|g)$/i;
export const isGcode = (name: string) => GCODE.test(name);

/** Splits a combined `/api/files` listing into its storages. */
export function splitByOrigin(entries: readonly FileEntry[]): Record<FileOrigin, FileEntry[]> {
  const result: Record<FileOrigin, FileEntry[]> = { local: [], sdcard: [] };
  for (const entry of entries) (result[entry.origin] ?? result.local).push(entry);
  return result;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** What sorting needs from any file source (local/SD entries, USB files). */
export interface Sortable {
  folder: boolean;
  name: string;
  date?: number | null;
  size?: number | null;
}

/** Folders always come first, ties are broken by name. */
export function compareItems(key: SortKey = 'name', direction: SortDirection = 'asc') {
  const sign = direction === 'asc' ? 1 : -1;
  return (a: Sortable, b: Sortable): number => {
    if (a.folder !== b.folder) return a.folder ? -1 : 1;
    let diff = 0;
    if (key === 'date') diff = (a.date ?? 0) - (b.date ?? 0);
    else if (key === 'size') diff = (a.size ?? 0) - (b.size ?? 0);
    return (diff || collator.compare(a.name, b.name)) * sign;
  };
}

const sortableEntry = (e: FileEntry): Sortable => ({
  folder: e.type === 'folder',
  name: e.display || e.name,
  date: e.date,
  size: e.size,
});

/** Sorts a copy of `entries`; folders always come first, ties are broken by name. */
export function sortEntries(
  entries: readonly FileEntry[],
  key: SortKey = 'name',
  direction: SortDirection = 'asc',
): FileEntry[] {
  const compare = compareItems(key, direction);
  return [...entries].sort((a, b) => compare(sortableEntry(a), sortableEntry(b)));
}

/** Children of the folder at `path` ('' = root), or `null` if it does not exist. */
export function folderChildren(root: readonly FileEntry[], path: string): FileEntry[] | null {
  let level: readonly FileEntry[] = root;
  const parts = path.split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i++) {
    const folderPath = parts.slice(0, i + 1).join('/');
    const folder = level.find((e) => e.type === 'folder' && e.path === folderPath);
    if (!folder) return null;
    level = folder.children ?? [];
  }
  return [...level];
}

/** Every printable file of a (recursive) listing, depth first. */
export function flattenFiles(entries: readonly FileEntry[]): FileEntry[] {
  const out: FileEntry[] = [];
  const walk = (list: readonly FileEntry[]) => {
    for (const entry of list) {
      if (entry.type === 'folder') walk(entry.children ?? []);
      else out.push(entry);
    }
  };
  walk(entries);
  return out;
}

/** Every folder path of a (recursive) listing, depth first (`a`, `a/b`, `c`…). */
export function folderPaths(entries: readonly FileEntry[]): string[] {
  const out: string[] = [];
  const walk = (list: readonly FileEntry[]) => {
    for (const entry of sortEntries(list)) {
      if (entry.type !== 'folder') continue;
      out.push(entry.path);
      walk(entry.children ?? []);
    }
  };
  walk(entries);
  return out;
}

export function findFile(entries: readonly FileEntry[], path: string): FileEntry | null {
  return flattenFiles(entries).find((e) => e.path === path) ?? null;
}

/** Lower case without accents: "Pièce" matches "piece". */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

/** True if every word of `query` appears in `text` (case and accent insensitive). */
export function matchesQuery(text: string, query: string): boolean {
  const haystack = normalizeText(text);
  return normalizeText(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** Files (in any folder) whose path matches the search query. */
export function searchFiles(entries: readonly FileEntry[], query: string): FileEntry[] {
  if (!query.trim()) return [];
  return flattenFiles(entries).filter((e) => matchesQuery(`${e.path} ${e.display ?? ''}`, query));
}

/** When a file was last printed, or else uploaded (seconds since the epoch). */
function lastUsed(entry: FileEntry): number {
  return Math.max(entry.prints?.last?.date ?? 0, entry.date ?? 0);
}

/** Most recently printed or uploaded files, newest first. */
export function recentFiles(entries: readonly FileEntry[], limit = 3): FileEntry[] {
  return flattenFiles(entries)
    .filter((e) => e.type === 'machinecode')
    .sort((a, b) => lastUsed(b) - lastUsed(a))
    .slice(0, limit);
}

export type ThumbnailSource = Partial<Pick<FileEntry, 'thumbnail' | 'path' | 'origin' | 'date' | 'type'>>;

/**
 * Thumbnail URL of a file. The Slicer Thumbnails plugin adds a relative `thumbnail` field
 * (`plugin/prusaslicerthumbnails/thumbnail/…png?…`), served through the agent proxy; otherwise
 * the agent extracts it from local G-code (a 404 there means "no thumbnail"). SD files have none.
 */
export function thumbnailUrl(entry: ThumbnailSource | null | undefined): string | null {
  const thumb = entry?.thumbnail;
  if (thumb) return /^[a-z]+:/i.test(thumb) ? null : `/${thumb.replace(/^\/+/, '')}`;
  if (entry?.origin === 'local' && entry.path && entry.type !== 'folder' && isGcode(entry.path)) {
    return localThumbnailUrl(entry.path, entry.date);
  }
  return null;
}

/** Parent folder of a storage path (`a/b/c.gcode` → `a/b`, `c.gcode` → ''). */
export function parentPath(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

/** Last segment of a path (`a/b/c.gcode` → `c.gcode`). */
export const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1);

export const joinPath = (folder: string, name: string) => (folder ? `${folder}/${name}` : name);

/** Breadcrumb of a folder path: `a/b` → [{name: 'a', path: 'a'}, {name: 'b', path: 'a/b'}]. */
export function breadcrumbs(path: string): { name: string; path: string }[] {
  const parts = path.split('/').filter(Boolean);
  return parts.map((name, i) => ({ name, path: parts.slice(0, i + 1).join('/') }));
}

/**
 * Whether the SD card tab is shown: OctoPrint's SD support must be on, and the firmware must not
 * have reported `Cap:SDCARD:0` (unknown = shown), unless the capability override decides.
 */
export function sdAvailable(sdSupport: boolean, reported: boolean | undefined, override: 'auto' | 'on' | 'off'): boolean {
  if (!sdSupport || override === 'off') return false;
  return override === 'on' || reported !== false;
}
