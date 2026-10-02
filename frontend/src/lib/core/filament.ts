/**
 * Filament load/unload/change/purge: G-code sequences built from the extruder settings, or the firmware's
 * own M701/M702 when that capability is enabled. A change is an unload followed by a load.
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

/** One block of moves of the wizard; a change is an unload followed by a load. */
export type RunKind = 'load' | 'unload' | 'purge';

/**
 * End marker of a wizard step: after `M400` (all moves done) the firmware echoes it back
 * (`M118 E1 …` → `Recv: echo:FOT-DONE <token>`). A `PositionUpdate` is not enough: with
 * AUTOREPORT_POS OctoPrint turns on M154 and Marlin reports the position every few seconds.
 */
export const markerCommand = (token: string) => `M118 E1 FOT-DONE ${token}`;
const MARKER_RE = /^Recv:\s*(?:echo:\s*)?FOT-DONE\s+(\w+)/i;

/** Tokens of the end markers in received log lines. */
export function markerTokens(lines: readonly string[]): string[] {
  return lines.flatMap((line) => {
    const match = MARKER_RE.exec(line.trim());
    return match ? [match[1]] : [];
  });
}

/**
 * Commands for a wizard step: G-code sequences, or M701/M702 when `firmware` (load/unload) is on.
 * `M400` + the end marker are appended. `seconds` = nominal duration, `null` when the firmware
 * drives the moves.
 */
export function actionGcode(
  kind: RunKind,
  f: FilamentSettings,
  firmware: boolean,
  token: string,
): { commands: string[]; seconds: number | null } {
  const done = ['M400', markerCommand(token)];
  if (firmware && kind === 'load') return { commands: ['M701', ...done], seconds: null };
  if (firmware && kind === 'unload') return { commands: ['M702', ...done], seconds: null };
  const moves = kind === 'load' ? loadMoves(f) : kind === 'unload' ? unloadMoves(f) : purgeMoves(f);
  return { commands: [...extrudeGcode(moves), ...done], seconds: movesDuration(moves) };
}

/** A marker earlier than this share of the nominal duration is not trusted (the moves cannot be done). */
export const MIN_DURATION_SHARE = 0.5;

/** The hot end is hot enough to move filament (cold extrusion protection). */
export function canExtrude(actual: number | null | undefined, minTemp: number): boolean {
  return actual != null && actual >= minTemp;
}

/** The heat-up step is over: within the "at target" tolerance of the gauges. */
export function reachedTarget(actual: number | null | undefined, target: number): boolean {
  return actual != null && actual >= target - AT_TARGET_TOLERANCE;
}

/** Steps of the wizard state; `insert` is also "swap the filament" of a change. */
export type WizardStep = 'material' | 'heat' | 'insert' | 'run' | 'purge' | 'done';
/** Steps of the progress row: a running step is shown by what it does. */
export type ProgressStep = Exclude<WizardStep, 'run'> | 'load' | 'unload';

export function wizardSteps(action: FilamentAction): ProgressStep[] {
  if (action === 'load') return ['material', 'heat', 'insert', 'load', 'purge', 'done'];
  if (action === 'unload') return ['material', 'heat', 'unload', 'done'];
  return ['material', 'heat', 'unload', 'insert', 'load', 'purge', 'done'];
}

export function progressStep(step: WizardStep, run: RunKind | null): ProgressStep {
  if (step !== 'run') return step;
  return run === 'unload' ? 'unload' : run === 'purge' ? 'purge' : 'load';
}

/** Where the wizard goes when a run of `kind` is over. */
export function stepAfterRun(action: FilamentAction, kind: RunKind): WizardStep {
  if (kind === 'unload') return action === 'change' ? 'insert' : 'done';
  return 'purge';
}
