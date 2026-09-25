/**
 * Filament load/unload/purge: G-code sequences built from the extruder settings, or the firmware's
 * own M701/M702/M600 when those capabilities are enabled.
 *
 * Moves are sent with relative extrusion (M83 … M82, like OctoPrint's own extrude command) and split
 * into pieces well below Marlin's EXTRUDE_MAXLENGTH (200 mm by default), which rejects longer moves.
 */
import { AT_TARGET_TOLERANCE } from './gauge';
import type { Settings } from './settings';

export type FilamentSettings = Settings['filament'];
export type FilamentAction = 'load' | 'unload' | 'change';

export const MAX_MOVE_MM = 100;

export interface ExtrudeMove {
  /** mm, negative = retract. */
  length: number;
  /** mm/min */
  feedrate: number;
}

/** Splits one move into pieces of at most `max` mm (same direction and speed). */
export function splitMove(length: number, feedrate: number, max = MAX_MOVE_MM): ExtrudeMove[] {
  const moves: ExtrudeMove[] = [];
  const sign = Math.sign(length);
  let left = Math.abs(length);
  while (left > 1e-6) {
    const piece = Math.min(max, left);
    moves.push({ length: Number((sign * piece).toFixed(3)), feedrate });
    left = Number((left - piece).toFixed(3));
  }
  return moves;
}

/** Bowden tube length only counts for bowden extruders. */
export const bowdenOf = (f: FilamentSettings) => (f.extruderType === 'bowden' ? Math.max(0, f.bowdenLength) : 0);

/** Load: fast through the bowden tube (if any), then slowly into the hot end. */
export function loadMoves(f: FilamentSettings): ExtrudeMove[] {
  return [...splitMove(bowdenOf(f), f.fastFeedrate), ...splitMove(f.loadSlowLength, f.slowFeedrate)];
}

/** Unload: a short push to soften the tip, then back out of the hot end and the bowden tube. */
export const UNLOAD_PUSH_MM = 5;
export function unloadMoves(f: FilamentSettings): ExtrudeMove[] {
  return [
    ...splitMove(UNLOAD_PUSH_MM, f.slowFeedrate),
    ...splitMove(-(Math.max(0, f.unloadLength) + bowdenOf(f)), f.fastFeedrate),
  ];
}

export function purgeMoves(f: FilamentSettings): ExtrudeMove[] {
  return splitMove(f.purgeLength, f.slowFeedrate);
}

const num = (v: number) => String(Number(v.toFixed(3)));

export function extrudeGcode(moves: readonly ExtrudeMove[]): string[] {
  if (!moves.length) return [];
  return ['M83', ...moves.map((m) => `G1 E${num(m.length)} F${Math.round(m.feedrate)}`), 'M82'];
}

/** Seconds the moves take at their nominal feed rates. */
export function movesDuration(moves: readonly ExtrudeMove[]): number {
  return moves.reduce((sum, m) => sum + (m.feedrate > 0 ? (Math.abs(m.length) / m.feedrate) * 60 : 0), 0);
}

/**
 * Commands for a wizard step. `firmware` = the M701/M702 capability (load/unload) or M600 (change).
 * `M400` + `M114` are appended so that the `PositionUpdate` answering M114 marks the end of the moves.
 */
export function actionGcode(
  action: FilamentAction | 'purge',
  f: FilamentSettings,
  firmware: boolean,
): { commands: string[]; seconds: number | null } {
  const done = ['M400', 'M114'];
  if (action === 'change') return { commands: ['M600', ...done], seconds: null };
  if (firmware && action === 'load') return { commands: ['M701', ...done], seconds: null };
  if (firmware && action === 'unload') return { commands: ['M702', ...done], seconds: null };
  const moves = action === 'load' ? loadMoves(f) : action === 'unload' ? unloadMoves(f) : purgeMoves(f);
  return { commands: [...extrudeGcode(moves), ...done], seconds: movesDuration(moves) };
}

/** The hot end is hot enough to move filament (cold extrusion protection). */
export function canExtrude(actual: number | null | undefined, minTemp: number): boolean {
  return actual != null && actual >= minTemp;
}

/** The heat-up step is over: within the "at target" tolerance of the gauges. */
export function reachedTarget(actual: number | null | undefined, target: number): boolean {
  return actual != null && actual >= target - AT_TARGET_TOLERANCE;
}

export type WizardStep = 'material' | 'heat' | 'insert' | 'run' | 'purge' | 'done';

/** Steps shown in the wizard's progress row. */
export function wizardSteps(action: FilamentAction): WizardStep[] {
  if (action === 'load') return ['material', 'heat', 'insert', 'run', 'purge', 'done'];
  return ['material', 'heat', 'run', 'done'];
}
