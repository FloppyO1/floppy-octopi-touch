/**
 * Live print overrides read from the terminal log: part cooling fan (M106/M107), feed rate (M220)
 * and flow (M221). OctoPrint does not report them, but every command it sends is logged as
 * `Send: …` (G-code files and other clients included), and Marlin answers the report forms:
 *
 *   Send: N120 M106 S127*34    fan 50 %          Recv: FR:110%           feed rate report (M220)
 *   Send: M107                 fan off           Recv: echo:E0 Flow: 95% flow report (M221)
 */

export interface TuneState {
  /** Percent; 100 after a firmware start. */
  feedrate: number;
  flow: number;
  /** Part cooling fan in percent, `null` until a command was seen. */
  fan: number | null;
}

export function createTuneState(): TuneState {
  return { feedrate: 100, flow: 100, fan: null };
}

const SEND_RE = /^Send:\s*(?:N\d+\s+)?(M10[67]|M22[01])(?![0-9])([^*;]*)/i;
const FEEDRATE_REPORT_RE = /^Recv:\s*(?:echo:\s*)?FR:\s*(\d+)%/i;
const FLOW_REPORT_RE = /^Recv:\s*(?:echo:\s*)?(?:E(\d+)\s+)?Flow:\s*(\d+)%/i;

/** Parameters of a G-code line (`S127 P0` → `{ S: 127, P: 0 }`); flags without a number are NaN. */
function params(text: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const match of text.matchAll(/([A-Z])\s*(-?\d*\.?\d*)/gi)) {
    out[match[1].toUpperCase()] = match[2] === '' ? NaN : Number(match[2]);
  }
  return out;
}

/** Fan speed in percent from an M106 `S` value (0-255; missing = full speed). */
export function fanPercent(s: number | undefined): number {
  if (s === undefined || Number.isNaN(s)) return 100;
  return Math.round((Math.min(255, Math.max(0, s)) / 255) * 100);
}

/** M106 value for a percentage (the inverse of `fanPercent`). */
export function fanValue(percent: number): number {
  return Math.round((Math.min(100, Math.max(0, percent)) / 100) * 255);
}

/** Applies one log line to `state` (mutated); returns true if something changed. */
export function applyTuneLine(state: TuneState, line: string): boolean {
  const before = JSON.stringify(state);
  const send = SEND_RE.exec(line.trim());
  if (send) {
    const code = send[1].toUpperCase();
    const p = params(send[2]);
    // Only the part cooling fan (P0) and the active/first extruder are tracked.
    const firstFan = p.P === undefined || p.P === 0;
    if (code === 'M106' && firstFan) state.fan = fanPercent(p.S);
    else if (code === 'M107' && firstFan) state.fan = 0;
    else if (code === 'M220' && Number.isFinite(p.S)) state.feedrate = Math.round(p.S);
    else if (code === 'M221' && Number.isFinite(p.S) && (p.T === undefined || p.T === 0)) {
      state.flow = Math.round(p.S);
    }
  } else {
    const feed = FEEDRATE_REPORT_RE.exec(line.trim());
    if (feed) state.feedrate = Number(feed[1]);
    const flow = FLOW_REPORT_RE.exec(line.trim());
    if (flow && (flow[1] === undefined || flow[1] === '0')) state.flow = Number(flow[2]);
  }
  return JSON.stringify(state) !== before;
}

export function applyTuneLines(state: TuneState, lines: readonly string[]): boolean {
  let changed = false;
  for (const line of lines) {
    // Cheap pre-filter: most lines are temperatures and plain moves.
    if (!/M10[67]|M22[01]|FR:|Flow:/i.test(line)) continue;
    if (applyTuneLine(state, line)) changed = true;
  }
  return changed;
}
