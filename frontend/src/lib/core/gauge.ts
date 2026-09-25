/** Geometry and colouring of the ring gauges (pure, used by RingGauge.svelte). */

/** Arc length in degrees; the gap is centred at the bottom (where the label goes). */
export const GAUGE_SWEEP = 270;

export type GaugeTone =
  | 'accent'
  | 'ok'
  | 'heating'
  | 'cooling'
  | 'paused'
  | 'error'
  | 'neutral';

/** Position of `value` in [min, max] as 0..1 (clamped; 0 for null or an empty range). */
export function gaugeFraction(value: number | null | undefined, min: number, max: number): number {
  if (value == null || !Number.isFinite(value) || max <= min) return 0;
  return Math.min(1, Math.max(0, (value - min) / (max - min)));
}

export interface ArcGeometry {
  radius: number;
  /** Full circumference: the dash pattern repeats on it. */
  circumference: number;
  /** Visible length of the track (the sweep). */
  track: number;
  /** Rotation (deg, SVG convention: 0 = 3 o'clock, clockwise) where the arc starts. */
  rotation: number;
}

export function arcGeometry(size: number, stroke: number, sweep = GAUGE_SWEEP): ArcGeometry {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return {
    radius,
    circumference,
    track: (circumference * sweep) / 360,
    // Start at the bottom-left end of the gap: 90° (6 o'clock) + half the gap.
    rotation: 90 + (360 - sweep) / 2,
  };
}

/** Point on the arc at `fraction` (0..1), for the target tick. */
export function arcPoint(
  size: number,
  radius: number,
  fraction: number,
  sweep = GAUGE_SWEEP,
): { x: number; y: number; angle: number } {
  const angle = 90 + (360 - sweep) / 2 + sweep * fraction;
  const rad = (angle * Math.PI) / 180;
  return { x: size / 2 + radius * Math.cos(rad), y: size / 2 + radius * Math.sin(rad), angle };
}

/** Degrees around the target considered "at temperature". */
export const AT_TARGET_TOLERANCE = 3;

/**
 * Colour of a heater gauge: off → neutral, below target → heating, near target → ok, above target
 * (cooling down to a lower target) → cooling.
 */
export function heaterTone(actual: number | null | undefined, target: number | null | undefined): GaugeTone {
  if (actual == null) return 'neutral';
  if (!target) return 'neutral';
  if (actual < target - AT_TARGET_TOLERANCE) return 'heating';
  if (actual > target + AT_TARGET_TOLERANCE) return 'cooling';
  return 'ok';
}
