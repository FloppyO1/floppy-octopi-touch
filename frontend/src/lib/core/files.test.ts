import { describe, expect, it } from 'vitest';
import type { FileEntry } from '../api/types';
import {
  baseName,
  breadcrumbs,
  compareItems,
  findFile,
  flattenFiles,
  folderChildren,
  folderPaths,
  isGcode,
  joinPath,
  matchesQuery,
  parentPath,
  sdAvailable,
  searchFiles,
  sortEntries,
  splitByOrigin,
  thumbnailUrl,
} from './files';

const file = (path: string, size: number, date: number, origin: 'local' | 'sdcard' = 'local'): FileEntry => {
  const name = path.split('/').pop()!;
  return { name, display: name, path, type: 'machinecode', typePath: ['machinecode', 'gcode'], origin, size, date };
};
const folder = (path: string, children: FileEntry[]): FileEntry => {
  const name = path.split('/').pop()!;
  return { name, display: name, path, type: 'folder', typePath: ['folder'], origin: 'local', children };
};

const tree: FileEntry[] = [
  file('b.gcode', 300, 10),
  folder('parts', [file('parts/gear.gcode', 100, 30), folder('parts/small', [file('parts/small/pin.gcode', 5, 40)])]),
  file('A10.gcode', 200, 20),
  file('A9.gcode', 100, 5),
  file('SD1.GCO', 50, 0, 'sdcard'),
];

describe('files helpers', () => {
  it('splits a combined listing by storage', () => {
    const { local, sdcard } = splitByOrigin(tree);
    expect(local).toHaveLength(4);
    expect(sdcard.map((f) => f.name)).toEqual(['SD1.GCO']);
  });

  it('sorts folders first, names naturally, by date and size in both directions', () => {
    const local = splitByOrigin(tree).local;
    expect(sortEntries(local).map((f) => f.name)).toEqual(['parts', 'A9.gcode', 'A10.gcode', 'b.gcode']);
    expect(sortEntries(local, 'date', 'desc').map((f) => f.name)).toEqual([
      'parts',
      'A10.gcode',
      'b.gcode',
      'A9.gcode',
    ]);
    expect(sortEntries(local, 'size').map((f) => f.name)).toEqual(['parts', 'A9.gcode', 'A10.gcode', 'b.gcode']);
  });

  it('navigates folders by path', () => {
    expect(folderChildren(tree, '')).toHaveLength(5);
    expect(folderChildren(tree, 'parts/small')?.map((f) => f.name)).toEqual(['pin.gcode']);
    expect(folderChildren(tree, 'missing')).toBeNull();
  });

  it('flattens and finds files', () => {
    expect(flattenFiles(tree)).toHaveLength(6);
    expect(findFile(tree, 'parts/small/pin.gcode')?.size).toBe(5);
    expect(findFile(tree, 'nope.gcode')).toBeNull();
  });

  it('computes parent paths, names and breadcrumbs', () => {
    expect(parentPath('a/b/c.gcode')).toBe('a/b');
    expect(parentPath('c.gcode')).toBe('');
    expect(baseName('a/b/c.gcode')).toBe('c.gcode');
    expect(joinPath('', 'c.gcode')).toBe('c.gcode');
    expect(joinPath('a/b', 'c.gcode')).toBe('a/b/c.gcode');
    expect(breadcrumbs('parts/small')).toEqual([
      { name: 'parts', path: 'parts' },
      { name: 'small', path: 'parts/small' },
    ]);
    expect(breadcrumbs('')).toEqual([]);
  });

  it('lists every folder for the import destination', () => {
    expect(folderPaths(tree)).toEqual(['parts', 'parts/small']);
  });

  it('searches every folder, ignoring case and accents, all words required', () => {
    const withAccent = [...tree, file('Pièce Été.gcode', 1, 1)];
    expect(searchFiles(withAccent, 'PIN').map((f) => f.path)).toEqual(['parts/small/pin.gcode']);
    expect(searchFiles(withAccent, 'piece ete').map((f) => f.name)).toEqual(['Pièce Été.gcode']);
    expect(searchFiles(withAccent, 'small gear')).toEqual([]);
    expect(searchFiles(withAccent, '   ')).toEqual([]);
    expect(matchesQuery('parts/small/pin.gcode', 'small pin')).toBe(true);
  });

  it('sorts any source with the same rules', () => {
    const items = [
      { folder: false, name: 'b', date: 2, size: 10 },
      { folder: true, name: 'z', date: 1, size: null },
      { folder: false, name: 'a', date: 3, size: 10 },
    ];
    expect([...items].sort(compareItems('size', 'desc')).map((i) => i.name)).toEqual(['z', 'b', 'a']);
    expect([...items].sort(compareItems('date', 'desc')).map((i) => i.name)).toEqual(['z', 'a', 'b']);
  });

  it('builds thumbnail URLs: plugin first, then the agent for local G-code only', () => {
    expect(thumbnailUrl({ origin: 'local', path: 'a b/c#1.gcode', date: 5 })).toBe(
      '/local/thumbnail?path=a+b%2Fc%231.gcode&v=5',
    );
    expect(thumbnailUrl({ origin: 'local', path: 'x.gcode', thumbnail: 'plugin/p/t.png' })).toBe('/plugin/p/t.png');
    expect(thumbnailUrl({ origin: 'sdcard', path: 'SD.GCO' })).toBeNull();
    expect(thumbnailUrl({ origin: 'local', path: 'parts', type: 'folder' })).toBeNull();
    expect(thumbnailUrl({ origin: 'local', path: 'model.stl' })).toBeNull();
    expect(isGcode('A.GCO')).toBe(true);
  });

  it('shows the SD tab unless OctoPrint or the firmware says there is no card', () => {
    expect(sdAvailable(true, undefined, 'auto')).toBe(true);
    expect(sdAvailable(true, true, 'auto')).toBe(true);
    expect(sdAvailable(true, false, 'auto')).toBe(false);
    expect(sdAvailable(true, false, 'on')).toBe(true);
    expect(sdAvailable(true, true, 'off')).toBe(false);
    expect(sdAvailable(false, true, 'on')).toBe(false);
  });
});
