import { describe, expect, it } from 'vitest';
import type { PrinterProfile } from '../api/types';
import {
  bedFromProfile,
  buildObjects,
  cancelMethod,
  displayName,
  emptyM486,
  ingestM486,
  remaining,
  svgPoints,
  toSvg,
  type ObjectsReport,
} from './objects';

const report: ObjectsReport = {
  objects: [
    { name: 'Cube id:0 copy 0', m486: 0, polygon: [[10, 10], [20, 10], [20, 20]], center: [16, 13], bbox: [10, 10, 20, 20] },
    { name: 'Cube id:1 copy 0', m486: 1, polygon: [[50, 50], [60, 50], [60, 60]], center: [56, 53], bbox: [50, 50, 60, 60] },
    { name: 'Cylinder id:2 copy 0', m486: 2, polygon: [], center: null, bbox: null },
  ],
  labels: ['plugin'],
  processed: true,
  truncated: false,
};

describe('cancelMethod', () => {
  it('prefers the firmware', () => {
    expect(cancelMethod(true, true)).toBe('m486');
    expect(cancelMethod(false, true)).toBe('plugin');
    expect(cancelMethod(false, false)).toBe('none');
  });
});

describe('ingestM486', () => {
  it('follows the active object, cancels and restores', () => {
    let state = emptyM486();
    state = ingestM486(['Send: N10 M486 S1*33', 'Recv: ok', 'Send: M486 P0'], state);
    expect(state).toEqual({ active: 1, cancelled: [0] });
    state = ingestM486(['Send: M486 C'], state);
    expect(state.cancelled).toEqual([0, 1]);
    state = ingestM486(['Send: M486 U0', 'Send: M486 S-1'], state);
    expect(state).toEqual({ active: null, cancelled: [1] });
    state = ingestM486(['Send: M486 T3'], state);
    expect(state).toEqual({ active: null, cancelled: [] });
  });

  it('reads everything after A as the name', () => {
    const state = ingestM486(['Send: N8 M486 S2*1', 'Send: N9 M486 AShape-Cylinder id:1 copy 0*19', 'Send: M486 APart C S5'], emptyM486());
    expect(state).toEqual({ active: 2, cancelled: [] });
  });

  it('keeps the same object when nothing changes', () => {
    const state = emptyM486();
    expect(ingestM486(['Send: G1 X1', 'Recv: echo:Unknown command: "M486 S1"', 'Send: M4860'], state)).toBe(state);
  });
});

describe('buildObjects', () => {
  it('uses the plugin list and matches the shapes by name', () => {
    const objects = buildObjects({
      method: 'plugin',
      report,
      plugin: [
        { id: 1, object: 'Cube id:1 copy 0', cancelled: true, ignore: false },
        { id: 0, object: 'Cube id:0 copy 0', cancelled: false, ignore: false },
        { id: 2, object: 'ENDGCODE', cancelled: false, ignore: true },
      ],
      pluginActive: 0,
      m486: emptyM486(),
    });
    expect(objects.map((o) => [o.number, o.name, o.target, o.cancelled, o.active])).toEqual([
      [1, 'Cube', 0, false, true],
      [2, 'Cube', 1, true, false],
    ]);
    expect(objects[1].polygon).toHaveLength(3);
    expect(remaining(objects)).toBe(1);
  });

  it('shows the file objects without targets when the plugin has no list', () => {
    const objects = buildObjects({ method: 'plugin', report, plugin: [], pluginActive: null, m486: emptyM486() });
    expect(objects).toHaveLength(3);
    expect(objects.every((o) => o.target === null)).toBe(true);
  });

  it('uses the M486 indices with the firmware', () => {
    const objects = buildObjects({
      method: 'm486',
      report,
      plugin: [],
      pluginActive: null,
      m486: { active: 2, cancelled: [1] },
    });
    expect(objects.map((o) => [o.name, o.target, o.cancelled, o.active])).toEqual([
      ['Cube', 0, false, false],
      ['Cube', 1, true, false],
      ['Cylinder', 2, false, true],
    ]);
  });
});

describe('displayName', () => {
  it('drops the instance suffix of PrusaSlicer and OrcaSlicer', () => {
    expect(displayName('Shape-Box id:0 copy 1')).toBe('Shape-Box');
    expect(displayName('#3')).toBe('#3');
    expect(displayName('part_1')).toBe('part_1');
  });
});

describe('bed map', () => {
  const profile = (origin: 'lowerleft' | 'center') =>
    ({ volume: { width: 220, depth: 200, height: 240, formFactor: 'rectangular', origin } }) as PrinterProfile;

  it('flips Y and moves centred origins', () => {
    const bed = bedFromProfile(profile('lowerleft'));
    expect(toSvg([0, 0], bed)).toEqual([0, 200]);
    expect(toSvg([220, 200], bed)).toEqual([220, 0]);
    const centred = bedFromProfile(profile('center'));
    expect(toSvg([0, 0], centred)).toEqual([110, 100]);
    expect(svgPoints([[10, 10], [20, 10]], bed)).toBe('10,190 20,190');
  });

  it('falls back to a 220 mm bed', () => {
    expect(bedFromProfile(null)).toMatchObject({ width: 220, depth: 220 });
  });
});
