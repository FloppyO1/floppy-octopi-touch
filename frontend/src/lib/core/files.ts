import type { FileEntry, FileOrigin } from '../api/types';

export type SortKey = 'name' | 'date' | 'size';
export type SortDirection = 'asc' | 'desc';

/** Splits a combined `/api/files` listing into its storages. */
export function splitByOrigin(entries: readonly FileEntry[]): Record<FileOrigin, FileEntry[]> {
  const result: Record<FileOrigin, FileEntry[]> = { local: [], sdcard: [] };
  for (const entry of entries) (result[entry.origin] ?? result.local).push(entry);
  return result;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Sorts a copy of `entries`; folders always come first, ties are broken by name. */
export function sortEntries(
  entries: readonly FileEntry[],
  key: SortKey = 'name',
  direction: SortDirection = 'asc',
): FileEntry[] {
  const sign = direction === 'asc' ? 1 : -1;
  const byName = (a: FileEntry, b: FileEntry) => collator.compare(a.display || a.name, b.display || b.name);
  return [...entries].sort((a, b) => {
    const folderA = a.type === 'folder';
    if (folderA !== (b.type === 'folder')) return folderA ? -1 : 1;
    let diff = 0;
    if (key === 'date') diff = (a.date ?? 0) - (b.date ?? 0);
    else if (key === 'size') diff = (a.size ?? 0) - (b.size ?? 0);
    return (diff || byName(a, b)) * sign;
  });
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

export function findFile(entries: readonly FileEntry[], path: string): FileEntry | null {
  return flattenFiles(entries).find((e) => e.path === path) ?? null;
}

/** Parent folder of a storage path (`a/b/c.gcode` → `a/b`, `c.gcode` → ''). */
export function parentPath(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}
