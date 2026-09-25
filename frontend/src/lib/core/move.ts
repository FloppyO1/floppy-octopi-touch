/**
 * Jogging: machine direction (inverted axes of the printer profile) and soft limits from the
 * profile's build volume, applied only while the head position is known (after an M114 report).
 */
import type { Axis, PrinterProfile } from '../api/types';

export interface HeadPosition {
  x: number | null;
  y: number | null;
  z: number | null;
  e: number | null;
}

export interface AxisBounds {
  min: number;
  max: number;
}

/** Position of an OctoPrint `PositionUpdate` event (the parsed M114 answer). */
export function positionFromEvent(payload: Record<string, unknown> | null): HeadPosition | null {
  if (!payload) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const position = { x: num(payload.x), y: num(payload.y), z: num(payload.z), e: num(payload.e) };
  return position.x === null && position.y === null && position.z === null ? null : position;
}

/** Build volume of the profile: X/Y from 0 (or centred on 0 for `center` origins), Z from 0. */
export function axisBounds(profile: PrinterProfile | null): Record<Axis, AxisBounds> | null {
  const volume = profile?.volume;
  if (!volume || !(volume.width > 0 && volume.depth > 0 && volume.height > 0)) return null;
  const centred = volume.origin === 'center';
  const span = (size: number): AxisBounds => (centred ? { min: -size / 2, max: size / 2 } : { min: 0, max: size });
  return { x: span(volume.width), y: span(volume.depth), z: { min: 0, max: volume.height } };
}

export interface JogPlan {
  /** Relative move in machine coordinates (0 = already at the limit). */
  amount: number;
  /** The move was shortened to stay inside the build volume. */
  clamped: boolean;
}

/**
 * Relative move for a jog button: `direction` is what the user sees (+ = right/back/up), `inverted`
 * comes from the printer profile. Without a known position or volume the move is not limited
 * (Marlin's own soft endstops still apply once homed).
 */
export function planJog(
  direction: 1 | -1,
  step: number,
  options: { position?: number | null; bounds?: AxisBounds | null; inverted?: boolean } = {},
): JogPlan {
  const amount = direction * step * (options.inverted ? -1 : 1);
  const { position, bounds } = options;
  if (position == null || !bounds) return { amount, clamped: false };
  const target = Math.min(bounds.max, Math.max(bounds.min, position + amount));
  const limited = Number((target - position).toFixed(3));
  // A tiny remainder (rounding of the reported position) counts as "at the limit".
  const clamped = Math.abs(limited - amount) > 1e-6;
  return { amount: Math.abs(limited) < 1e-3 ? 0 : limited, clamped };
}

export function formatAxis(value: number | null | undefined): string {
  return value == null ? '—' : value.toFixed(2);
}
