/**
 * Bed leveling without a probe (paper test at the four corners and the centre) and the G-code of
 * the leveling tools: manual mesh (MBL `G29 S1/S2`), automatic `G29`, babystepping, probe Z offset.
 */
import type { PrinterProfile } from '../api/types';

export const LEVELING_POINTS = ['front-left', 'front-right', 'back-right', 'back-left', 'center'] as const;
export type LevelingPointId = (typeof LEVELING_POINTS)[number];

export interface LevelingPoint {
  id: LevelingPointId;
  /** Machine coordinates (mm). */
  x: number;
  y: number;
  /** Position on the bed drawing, 0-1 from the left / from the front. */
  u: number;
  v: number;
}

/**
 * The five paper-test points, `inset` mm inside the bed edges (clamped so that points never cross
 * the middle). `null` without a build volume in the printer profile.
 */
export function levelingPoints(profile: PrinterProfile | null, inset: number): LevelingPoint[] | null {
  const volume = profile?.volume;
  if (!volume || !(volume.width > 0 && volume.depth > 0)) return null;
  const { width, depth } = volume;
  const margin = Math.max(0, Math.min(inset, width / 2 - 1, depth / 2 - 1));
  const originX = volume.origin === 'center' ? -width / 2 : 0;
  const originY = volume.origin === 'center' ? -depth / 2 : 0;
  const at = (id: LevelingPointId, x: number, y: number): LevelingPoint => ({
    id,
    x: Number((originX + x).toFixed(2)),
    y: Number((originY + y).toFixed(2)),
    u: x / width,
    v: y / depth,
  });
  return [
    at('front-left', margin, margin),
    at('front-right', width - margin, margin),
    at('back-right', width - margin, depth - margin),
    at('back-left', margin, depth - margin),
    at('center', width / 2, depth / 2),
  ];
}

/** The point after `current` in the order above (the first one when nothing was visited). */
export function nextPoint(current: LevelingPointId | null): LevelingPointId {
  if (current === null) return LEVELING_POINTS[0];
  return LEVELING_POINTS[(LEVELING_POINTS.indexOf(current) + 1) % LEVELING_POINTS.length];
}

export interface TravelOptions {
  /** Height for the travel between points (mm). */
  zHop: number;
  xyFeedrate: number;
  zFeedrate: number;
}

const mm = (v: number) => String(Number(v.toFixed(3)));

/** Lift, travel to the point, lower the nozzle to Z0 for the paper test. */
export function pointGcode(point: { x: number; y: number }, o: TravelOptions): string[] {
  return [
    'G90',
    `G1 Z${mm(o.zHop)} F${Math.round(o.zFeedrate)}`,
    `G1 X${mm(point.x)} Y${mm(point.y)} F${Math.round(o.xyFeedrate)}`,
    `G1 Z0 F${Math.round(o.zFeedrate)}`,
  ];
}

/** End of the paper test: nozzle back up. */
export function liftGcode(o: TravelOptions): string[] {
  return ['G90', `G1 Z${mm(o.zHop)} F${Math.round(o.zFeedrate)}`];
}

/** Babystep: `amount` > 0 moves the nozzle away from the bed. */
export const babystepGcode = (amount: number) => `M290 Z${mm(amount)}`;

export const setProbeOffsetGcode = (z: number) => `M851 Z${mm(z)}`;

/** Automatic leveling: home first (Marlin requires it), probe, then print the new mesh. */
export const AUTO_LEVEL_GCODE = ['G28', 'G29', 'M420 V'];
/** Manual mesh: `G29 S1` homes and goes to the first point, each `G29 S2` stores Z and moves on. */
export const MBL_START_GCODE = ['G29 S1'];
export const MBL_NEXT_GCODE = ['G29 S2'];
export const READ_MESH_GCODE = ['M420 V'];

/** Axes homed by a sent `G28` (none = all), `null` if the line is not a G28. */
export function homedAxes(line: string): ('x' | 'y' | 'z')[] | null {
  const match = /^Send:\s*(?:N\d+\s+)?G28(?![0-9])([^*;]*)/i.exec(line.trim());
  if (!match) return null;
  const axes = (['x', 'y', 'z'] as const).filter((a) => new RegExp(`\\b${a}`, 'i').test(match[1]));
  return axes.length ? axes : ['x', 'y', 'z'];
}

/** A sent `M84` / `M18` (steppers off: the position is lost). */
export const isMotorsOff = (line: string) => /^Send:\s*(?:N\d+\s+)?M(?:84|18)(?![0-9])/i.test(line.trim());
