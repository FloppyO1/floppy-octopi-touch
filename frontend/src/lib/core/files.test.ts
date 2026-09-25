import { describe, expect, it } from 'vitest';
import type { FileEntry } from '../api/types';
import { findFile, flattenFiles, folderChildren, parentPath, sortEntries, splitByOrigin } from './files';

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

  it('computes parent paths', () => {
    expect(parentPath('a/b/c.gcode')).toBe('a/b');
    expect(parentPath('c.gcode')).toBe('');
  });
});
