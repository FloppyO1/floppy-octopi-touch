import { describe, expect, it } from 'vitest';
import type { PrinterProfile } from '../api/types';
import {
  babystepGcode,
  homedAxes,
  isMotorsOff,
  levelingPoints,
  liftGcode,
  nextPoint,
  pointGcode,
  setProbeOffsetGcode,
} from './leveling';
import { moveById, nameTaken, removeById, upsertById } from './lists';
import { macroCommands, validateMacro } from './macros';
import { formatOffset, LevelingParser, meshStats, meshTone, type LevelingFinding } from './mesh';
import { defaultMacros } from './settings';
import { defaultTerminalFilters, lineFilter, lineKind, normalizeCommand, pushHistory, visibleLines } from './terminal';

const recv = (text: string) => text.split('\n').map((line) => `Recv: ${line}`);
const meshes = (findings: LevelingFinding[]) =>
  findings.flatMap((f) => (f.type === 'mesh' ? [f.mesh] : []));

// Marlin 2.1 `M420 V` with AUTO_BED_LEVELING_BILINEAR, 3x3 grid (print_2d_array, 3 decimals).
const BILINEAR = recv(`Bilinear Leveling Grid:
      0      1      2
 0 +0.125 +0.050 -0.012
 1 +0.083 +0.000 -0.047
 2 +0.021 -0.036 -0.090

echo:Bed Leveling ON
echo:Fade Height 10.00`);

// Same, with ABL_BILINEAR_SUBDIVISION: the subdivided grid follows and must be ignored.
const SUBDIVIDED = recv(`Bilinear Leveling Grid:
      0      1
 0 -0.100 +0.200
 1 +0.050 +0.010
Subdivided with CATMULL ROM Leveling Grid:
        0        1        2
 0 -0.10000 +0.03000 +0.20000
 1 -0.02000 +0.04000 +0.10000
 2 +0.05000 +0.03000 +0.01000
echo:Bed Leveling OFF`);

// Marlin 2.1 `G29 S0` with MESH_BED_LEVELING (5 decimals), one point not measured.
const MBL = recv(`Mesh Bed Leveling ON
3x3 mesh. Z offset: 0.00000
Measured points:
        0        1        2
 0 +0.12500 +0.05000 -0.01250
 1 +0.08750 +0.00000 -0.05000
 2 +0.02500 -0.03750  =======
ok`);

describe('mesh parser', () => {
  it('reads a bilinear grid with the leveling state (front row first)', () => {
    const found = new LevelingParser().feedAll(BILINEAR);
    expect(meshes(found)).toEqual([
      {
        kind: 'bilinear',
        rows: [
          [0.125, 0.05, -0.012],
          [0.083, 0, -0.047],
          [0.021, -0.036, -0.09],
        ],
      },
    ]);
    expect(found).toContainEqual({ type: 'active', active: true });
  });

  it('ignores the subdivided grid and the lines OctoPrint sends meanwhile', () => {
    const lines = [...SUBDIVIDED.slice(0, 2), 'Send: M105', ...SUBDIVIDED.slice(2)];
    const found = new LevelingParser().feedAll(lines);
    expect(meshes(found)).toEqual([{ kind: 'bilinear', rows: [[-0.1, 0.2], [0.05, 0.01]] }]);
    expect(found).toContainEqual({ type: 'active', active: false });
  });

  it('reads an MBL report split over several socket messages, with unmeasured points', () => {
    const parser = new LevelingParser();
    const first = parser.feedAll(MBL.slice(0, 5));
    expect(meshes(first)).toEqual([]);
    expect(parser.busy).toBe(true);
    const rest = parser.feedAll(MBL.slice(5));
    expect(meshes(rest)).toEqual([
      {
        kind: 'mbl',
        rows: [
          [0.125, 0.05, -0.0125],
          [0.0875, 0, -0.05],
          [0.025, -0.0375, null],
        ],
      },
    ]);
    expect(first).toContainEqual({ type: 'active', active: true });
    expect(parser.busy).toBe(false);
  });

  it('reports a missing mesh, the probe offset and the end of manual probing', () => {
    const found = new LevelingParser().feedAll([
      'Recv: Mesh Bed Leveling has no data.',
      'Recv: echo:; Z-Probe Offset:',
      'Recv: echo:  M851 X-44.00 Y-9.00 Z-1.60 ; (mm)',
      'Recv: Probe Offset X0 Y0 Z-2.05',
      'Recv: echo:Probe Z Offset: 0.35',
      'Recv: Mesh probing done.',
      'Send: M851 Z-9',
    ]);
    expect(found).toEqual([
      { type: 'noMesh' },
      { type: 'probeOffset', z: -1.6 },
      { type: 'probeOffset', z: -2.05 },
      { type: 'probeOffset', z: 0.35 },
      { type: 'mblDone' },
    ]);
  });

  it('does not take temperature or position lines for grid rows', () => {
    const found = new LevelingParser().feedAll(
      recv('ok T:210.0 /210.0 B:60.0 /60.0\nX:10.00 Y:0.00 Z:0.00 E:0.00 Count X:800 Y:0 Z:0\n0 1 2'),
    );
    expect(found).toEqual([]);
  });

  it('computes min/max/range and the diverging colour position', () => {
    const [mesh] = meshes(new LevelingParser().feedAll(BILINEAR));
    const stats = meshStats(mesh)!;
    expect(stats).toMatchObject({ min: -0.09, max: 0.125, range: 0.215, minAt: { x: 2, y: 2 }, maxAt: { x: 0, y: 0 } });
    expect(stats.mean).toBeCloseTo(0.0104, 4);
    expect(meshTone(stats.max, stats)).toBeCloseTo(1, 5);
    expect(meshTone(stats.mean, stats)).toBe(0);
    // Symmetric scale: the lowest point is a bit closer to the average than the highest one.
    expect(meshTone(stats.min, stats)).toBeCloseTo(-0.876, 3);
    // A nearly flat bed keeps pale colours.
    const flat = meshStats({ kind: 'mbl', rows: [[0.01, 0.02], [0.0, 0.01]] })!;
    expect(Math.abs(meshTone(0.02, flat))).toBeLessThan(0.25);
    expect(meshStats({ kind: 'mbl', rows: [[null]] })).toBeNull();
  });

  it('formats offsets with a sign', () => {
    expect(formatOffset(0.1)).toBe('+0.100');
    expect(formatOffset(-0.0001)).toBe('0.000');
    expect(formatOffset(-0.25, 2)).toBe('-0.25');
    expect(formatOffset(null)).toBe('—');
  });
});

describe('paper test and leveling G-code', () => {
  const profile = { volume: { width: 220, depth: 220, height: 240, origin: 'lowerleft' } } as PrinterProfile;

  it('places the four corners inside the bed and the centre', () => {
    const points = levelingPoints(profile, 30)!;
    expect(points.map((p) => [p.id, p.x, p.y])).toEqual([
      ['front-left', 30, 30],
      ['front-right', 190, 30],
      ['back-right', 190, 190],
      ['back-left', 30, 190],
      ['center', 110, 110],
    ]);
    expect(points[1]).toMatchObject({ u: 190 / 220, v: 30 / 220 });
    const centred = levelingPoints({ volume: { ...profile.volume, origin: 'center' } } as PrinterProfile, 500)!;
    expect(centred[0]).toMatchObject({ x: -1, y: -1 });
    expect(centred[4]).toMatchObject({ x: 0, y: 0 });
    expect(levelingPoints(null, 30)).toBeNull();
  });

  it('goes round the points in order', () => {
    expect(nextPoint(null)).toBe('front-left');
    expect(nextPoint('back-left')).toBe('center');
    expect(nextPoint('center')).toBe('front-left');
  });

  it('builds the moves: lift, travel, Z0', () => {
    const travel = { zHop: 5, xyFeedrate: 3000, zFeedrate: 300 };
    expect(pointGcode({ x: 30, y: 190.5 }, travel)).toEqual(['G90', 'G1 Z5 F300', 'G1 X30 Y190.5 F3000', 'G1 Z0 F300']);
    expect(liftGcode(travel)).toEqual(['G90', 'G1 Z5 F300']);
    expect(babystepGcode(-0.05)).toBe('M290 Z-0.05');
    expect(setProbeOffsetGcode(-1.6)).toBe('M851 Z-1.6');
  });

  it('tracks homing from the sent lines', () => {
    expect(homedAxes('Send: G28')).toEqual(['x', 'y', 'z']);
    expect(homedAxes('Send: N12 G28 X Y*93')).toEqual(['x', 'y']);
    expect(homedAxes('Send: G28 Z0')).toEqual(['z']);
    expect(homedAxes('Send: G29')).toBeNull();
    expect(homedAxes('Recv: G28')).toBeNull();
    expect(isMotorsOff('Send: M84')).toBe(true);
    expect(isMotorsOff('Send: N5 M18*20')).toBe(true);
    expect(isMotorsOff('Send: M840')).toBe(false);
  });
});

describe('terminal', () => {
  it('classifies lines into filters', () => {
    expect(lineFilter('Send: M105')).toBe('temperature');
    expect(lineFilter('Send: N123 M105*35')).toBe('temperature');
    expect(lineFilter('Recv:  T:210.0 /210.0 B:60.0 /60.0 @:0 B@:0')).toBe('temperature');
    expect(lineFilter('Recv: ok T:21.3 /0.0 B:21.3 /0.0 @:0 B@:0')).toBe('temperature');
    expect(lineFilter('Recv: ok')).toBe('ok');
    expect(lineFilter('Recv: ok N12 P15 B3')).toBe('ok');
    expect(lineFilter('Recv: echo:busy: processing')).toBe('busy');
    expect(lineFilter('Recv: wait')).toBe('busy');
    expect(lineFilter('Send: M27')).toBe('sd');
    expect(lineFilter('Recv: SD printing byte 123/456')).toBe('sd');
    expect(lineFilter('Send: M400')).toBe('position');
    expect(lineFilter('Recv: X:10.00 Y:0.00 Z:0.00 E:0.00 Count X:800 Y:0 Z:0')).toBe('position');
    expect(lineFilter('Send: M1050')).toBeNull();
    expect(lineFilter('Recv: echo:  M851 X5.00 Y5.00 Z0.20')).toBeNull();
  });

  it('tells sent, received, error and info lines apart', () => {
    expect(lineKind('Send: G28')).toBe('send');
    expect(lineKind('Recv: ok')).toBe('recv');
    expect(lineKind('Recv: Error:Printer halted. kill() called!')).toBe('error');
    expect(lineKind('Recv: echo:Unknown command: "M999X"')).toBe('warning');
    expect(lineKind("Changing monitoring state from 'Connecting' to 'Operational'")).toBe('info');
  });

  it('keeps the newest visible lines', () => {
    const lines = ['Send: G28', 'Recv: ok', 'Send: M105', 'Recv: ok T:20 /0', 'Send: M114', 'Recv: X:0.00 Y:0.00 Z:0.00']
      .map((text, id) => ({ id, text }));
    const texts = (filters = defaultTerminalFilters(), limit = 10) => visibleLines(lines, filters, limit).map((l) => l.text);
    expect(texts()).toEqual(['Send: G28', 'Recv: ok', 'Send: M114', 'Recv: X:0.00 Y:0.00 Z:0.00']);
    expect(texts({ ...defaultTerminalFilters(), ok: true, position: true })).toEqual(['Send: G28']);
    expect(texts(undefined, 2)).toEqual(['Send: M114', 'Recv: X:0.00 Y:0.00 Z:0.00']);
  });

  it('normalizes commands and keeps a history without duplicates', () => {
    expect(normalizeCommand('  G1   X10  ')).toBe('G1 X10');
    expect(pushHistory(['M114', 'G28'], 'G28')).toEqual(['G28', 'M114']);
    expect(pushHistory(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b']);
  });
});

describe('macros and lists', () => {
  const macros = defaultMacros();

  it('turns the macro text into commands', () => {
    expect(macroCommands('G91 ; relative\n\n  G1   Z10 F600\n; only a comment\nG90\r\n')).toEqual(['G91', 'G1 Z10 F600', 'G90']);
  });

  it('validates name, duplicates and commands', () => {
    const macro = { id: 'x', name: 'Lights', icon: 'light', color: 'ok', gcode: 'M355 S1', confirm: false };
    expect(validateMacro(macro, macros)).toBeNull();
    expect(validateMacro({ ...macro, name: '  ' }, macros)).toBe('name');
    expect(validateMacro({ ...macro, name: 'home ALL' }, macros)).toBe('duplicate');
    expect(validateMacro({ ...macros[0], name: 'Home all' }, macros)).toBeNull();
    expect(validateMacro({ ...macro, gcode: '; nothing' }, macros)).toBe('empty');
    expect(validateMacro({ ...macro, gcode: Array(51).fill('G4 P1').join('\n') }, macros)).toBe('long');
  });

  it('reorders, replaces and removes items by id', () => {
    const ids = (list: { id: string }[]) => list.map((m) => m.id);
    expect(ids(moveById(macros, 'park', -1))).toEqual(['park', 'home', 'motors-off', 'report']);
    expect(ids(moveById(macros, 'report', 1))).toEqual(ids(macros));
    expect(upsertById(macros, { ...macros[1], name: 'Park' })[1].name).toBe('Park');
    expect(ids(removeById(macros, 'home'))).toEqual(['park', 'motors-off', 'report']);
    expect(nameTaken(macros, 'new', ' park HEAD ')).toBe(true);
    expect(macros.map((m) => m.name)).toEqual(['Home all', 'Park head', 'Motors off', 'Report settings']);
  });
});
