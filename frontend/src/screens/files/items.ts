/** Uniform view model of local/SD entries and USB files for the grid and the list. */
import { usbThumbnailUrl } from '../../lib/api/agent';
import type { FileEntry, UsbFile } from '../../lib/api/types';
import { compareItems, parentPath, thumbnailUrl, type SortDirection, type SortKey } from '../../lib/core/files';
import type { Detail } from './view.svelte';

export interface Item {
  key: string;
  folder: boolean;
  name: string;
  /** Folder in which a search result lives, or the stick of a USB file. */
  location: string;
  date: number | null;
  size: number | null;
  thumb: string | null;
  estimate: number | null;
  /** Folders: number of entries. */
  count: number;
  /** Being printed (cannot be deleted). */
  busy: boolean;
  /** Folders: path to open; files: what the detail shows. */
  target: { folder: string } | Detail;
}

export function entryItem(entry: FileEntry, busy: ReadonlySet<string>, withLocation = false): Item {
  const folder = entry.type === 'folder';
  return {
    key: `${entry.origin}:${entry.path}`,
    folder,
    name: entry.display || entry.name,
    location: withLocation ? parentPath(entry.path) : '',
    date: entry.date ?? null,
    size: folder ? null : (entry.size ?? null),
    thumb: folder ? null : thumbnailUrl(entry),
    estimate: entry.gcodeAnalysis?.estimatedPrintTime ?? null,
    count: entry.children?.length ?? 0,
    busy: busy.has(`${entry.origin}:${entry.path}`),
    target: folder ? { folder: entry.path } : { kind: 'entry', origin: entry.origin, path: entry.path },
  };
}

export function usbItem(file: UsbFile, withMount: boolean): Item {
  return {
    key: `usb:${file.mount}:${file.path}`,
    folder: false,
    name: file.name,
    location: [withMount ? file.mount : '', parentPath(file.path)].filter(Boolean).join(' › '),
    date: file.date,
    size: file.size,
    thumb: usbThumbnailUrl(file.mount, file.path),
    estimate: null,
    count: 0,
    busy: false,
    target: { kind: 'usb', mount: file.mount, path: file.path },
  };
}

export function sortItems(items: Item[], key: SortKey, direction: SortDirection): Item[] {
  return [...items].sort(compareItems(key, direction));
}
