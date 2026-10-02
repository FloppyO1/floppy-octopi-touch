import { describe, expect, it } from 'vitest';
import type { PrinterProfile } from '../api/types';
import {
  actionGcode,
  canExtrude,
  extrudeGcode,
  loadMoves,
  markerTokens,
  movesDuration,
  progressStep,
  reachedTarget,
  splitMove,
  stepAfterRun,
  unloadMoves,
  wizardSteps,
} from './filament';
import { axisBounds, formatAxis, planJog, positionFromEvent } from './move';
import { movePreset, removePreset, upsertPreset, validatePreset } from './presets';
import { defaultPresets, defaultSettings } from './settings';

describe('presets', () => {
  const list = defaultPresets();
  const max = { hotend: 275, bed: 110 };

  it('moves a preset up and down, not past the ends', () => {
    expect(movePreset(list, 'petg', -1).map((p) => p.id)).toEqual(['petg', 'pla', 'tpu']);
    expect(movePreset(list, 'petg', 1).map((p) => p.id)).toEqual(['pla', 'tpu', 'petg']);
    expect(movePreset(list, 'pla', -1).map((p) => p.id)).toEqual(['pla', 'petg', 'tpu']);
    expect(movePreset(list, 'nope', 1)).toEqual(list);
  });

  it('adds, replaces and removes presets without mutating the list', () => {
    const abs = { id: 'abs', name: 'ABS', hotend: 245, bed: 100, fan: 0 };
    expect(upsertPreset(list, abs).map((p) => p.id)).toEqual(['pla', 'petg', 'tpu', 'abs']);
    expect(upsertPreset(list, { ...list[0], hotend: 210 })[0].hotend).toBe(210);
    expect(removePreset(list, 'petg').map((p) => p.id)).toEqual(['pla', 'tpu']);
    expect(list.map((p) => p.id)).toEqual(['pla', 'petg', 'tpu']);
  });

  it('validates names, duplicates and limits', () => {
    const ok = { id: 'new', name: 'ABS', hotend: 245, bed: 100, fan: null };
    expect(validatePreset(ok, list, max)).toBeNull();
    expect(validatePreset({ ...ok, name: '  ' }, list, max)).toBe('name');
    expect(validatePreset({ ...ok, name: 'x'.repeat(25) }, list, max)).toBe('name');
    expect(validatePreset({ ...ok, name: ' pla ' }, list, max)).toBe('duplicate');
    expect(validatePreset({ ...list[0], hotend: 205 }, list, max)).toBeNull(); // same id: not a duplicate
    expect(validatePreset({ ...ok, hotend: 280 }, list, max)).toBe('hotend');
    expect(validatePreset({ ...ok, bed: -1 }, list, max)).toBe('bed');
    expect(validatePreset({ ...ok, fan: 120 }, list, max)).toBe('fan');
  });
});

describe('move', () => {
  const profile = {
    volume: { width: 220, depth: 220, height: 240, formFactor: 'rectangular', origin: 'lowerleft' },
  } as PrinterProfile;

  it('reads the position of a PositionUpdate event', () => {
    expect(positionFromEvent({ x: 10, y: 20.5, z: 0.2, e: 0, t: 0, f: 3000, reason: null })).toEqual({
      x: 10,
      y: 20.5,
      z: 0.2,
      e: 0,
    });
    expect(positionFromEvent({ x: null, y: null, z: null })).toBeNull();
    expect(positionFromEvent(null)).toBeNull();
  });

  it('derives the soft limits from the build volume', () => {
    expect(axisBounds(profile)).toEqual({ x: { min: 0, max: 220 }, y: { min: 0, max: 220 }, z: { min: 0, max: 240 } });
    const delta = { volume: { ...profile.volume, origin: 'center' } } as PrinterProfile;
    expect(axisBounds(delta)?.x).toEqual({ min: -110, max: 110 });
    expect(axisBounds(null)).toBeNull();
  });

  it('jogs freely without a known position', () => {
    expect(planJog(1, 10)).toEqual({ amount: 10, clamped: false });
    expect(planJog(-1, 0.1, { bounds: { min: 0, max: 220 } })).toEqual({ amount: -0.1, clamped: false });
  });

  it('applies inverted axes and clamps to the build volume', () => {
    const bounds = { min: 0, max: 220 };
    expect(planJog(1, 10, { inverted: true, position: 50, bounds })).toEqual({ amount: -10, clamped: false });
    expect(planJog(1, 50, { position: 200, bounds })).toEqual({ amount: 20, clamped: true });
    expect(planJog(-1, 10, { position: 3.5, bounds })).toEqual({ amount: -3.5, clamped: true });
    expect(planJog(-1, 10, { position: 0, bounds })).toEqual({ amount: 0, clamped: true });
    expect(planJog(1, 1, { position: 219.9999, bounds })).toEqual({ amount: 0, clamped: true });
  });

  it('formats axis values', () => {
    expect(formatAxis(12.3456)).toBe('12.35');
    expect(formatAxis(null)).toBe('—');
  });
});

describe('filament', () => {
  const f = { ...defaultSettings().filament };

  it('splits long moves below the firmware limit', () => {
    expect(splitMove(250, 1500)).toEqual([
      { length: 100, feedrate: 1500 },
      { length: 100, feedrate: 1500 },
      { length: 50, feedrate: 1500 },
    ]);
    expect(splitMove(-30, 600)).toEqual([{ length: -30, feedrate: 600 }]);
    expect(splitMove(0, 600)).toEqual([]);
  });

  it('loads with the prudent defaults: no bowden, 100 mm slowly', () => {
    expect(loadMoves(f)).toEqual([{ length: 100, feedrate: 150 }]);
    expect(extrudeGcode(loadMoves(f))).toEqual(['M83', 'G1 E100 F150', 'M82']);
  });

  it('adds the bowden tube only for bowden extruders', () => {
    const bowden = { ...f, extruderType: 'bowden' as const, bowdenLength: 420 };
    expect(loadMoves(bowden).map((m) => m.length)).toEqual([100, 100, 100, 100, 20, 100]);
    expect(loadMoves({ ...bowden, extruderType: 'direct' })).toEqual([{ length: 100, feedrate: 150 }]);
    const unload = unloadMoves(bowden);
    expect(unload[0]).toEqual({ length: 5, feedrate: 150 });
    expect(unload.slice(1).reduce((sum, m) => sum + m.length, 0)).toBe(-520);
  });

  it('estimates the duration from the feed rates', () => {
    expect(movesDuration([{ length: 100, feedrate: 150 }, { length: -25, feedrate: 1500 }])).toBeCloseTo(41);
  });

  it('uses the firmware commands when enabled and marks the end with M400 + an echoed marker', () => {
    expect(actionGcode('load', f, true, '42')).toEqual({
      commands: ['M701', 'M400', 'M118 E1 FOT-DONE 42'],
      seconds: null,
    });
    expect(actionGcode('unload', f, true, '42').commands[0]).toBe('M702');
    const purge = actionGcode('purge', f, true, '7');
    expect(purge.commands).toEqual(['M83', 'G1 E20 F150', 'M82', 'M400', 'M118 E1 FOT-DONE 7']);
    expect(purge.seconds).toBeCloseTo(8);
  });

  it('reads the echoed markers only from received lines', () => {
    expect(
      markerTokens([
        'Send: N9 M118 E1 FOT-DONE 123*44',
        'Recv: echo:FOT-DONE 123',
        'Recv: FOT-DONE 9',
        'Recv: X:0.00 Y:0.00 Z:0.00 E:20.00 Count X:0 Y:0 Z:0',
      ]),
    ).toEqual(['123', '9']);
  });

  it('protects against cold extrusion and detects the heated hot end', () => {
    expect(canExtrude(169, 170)).toBe(false);
    expect(canExtrude(170, 170)).toBe(true);
    expect(canExtrude(null, 170)).toBe(false);
    expect(reachedTarget(197, 200)).toBe(true);
    expect(reachedTarget(190, 200)).toBe(false);
  });

  it('lists the wizard steps per action; a change unloads, then loads', () => {
    expect(wizardSteps('load')).toEqual(['material', 'heat', 'insert', 'load', 'purge', 'done']);
    expect(wizardSteps('unload')).toEqual(['material', 'heat', 'unload', 'done']);
    expect(wizardSteps('change')).toEqual(['material', 'heat', 'unload', 'insert', 'load', 'purge', 'done']);
    expect(progressStep('run', 'unload')).toBe('unload');
    expect(progressStep('run', 'purge')).toBe('purge');
    expect(progressStep('insert', null)).toBe('insert');
    expect(stepAfterRun('change', 'unload')).toBe('insert');
    expect(stepAfterRun('unload', 'unload')).toBe('done');
    expect(stepAfterRun('change', 'load')).toBe('purge');
    expect(stepAfterRun('load', 'purge')).toBe('purge');
  });
});
