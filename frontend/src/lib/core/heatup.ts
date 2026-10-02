/**
 * Blocking heat-up waits (M109 / M190 / M191). While Marlin waits it reads no other command, so a
 * new target sent from the screen would only arrive once the wait is over. With EMERGENCY_PARSER,
 * M108 ends the wait at once (OctoPrint sends it ahead of its queue, Marlin keeps the target): the
 * dashboard queues the new wait first, then sends M108.
 *
 * The wait is read from the terminal log. OctoPrint sends one line at a time and waits for `ok`, so
 * after `Send: M109 …` nothing else is sent until the wait ends; the next `Send:` or `ok` closes it.
 *
 *   Send: N12 M109 S215*80     wait for tool0 (active tool) to reach 215 °C
 *   Recv:  T:150.20 /215.00 …  progress reports, no `ok`
 *   Recv: ok                   done
 */

export type WaitCode = 'M109' | 'M190' | 'M191';

export interface HeatupWait {
  code: WaitCode;
  /** `tool0`…, `bed`, `chamber`. */
  heater: string;
  /** `T` parameter of the line, `null` = the active tool. */
  tool: number | null;
  target: number;
  /** `S` waits only while heating, `R` also while cooling. */
  mode: 'S' | 'R';
}

export interface HeatupState {
  wait: HeatupWait | null;
  /** Last `T<n>` tool change sent. */
  activeTool: number;
}

export function createHeatupState(): HeatupState {
  return { wait: null, activeTool: 0 };
}

const SEND_RE = /^Send:\s*(?:N\d+\s+)?(\S+)([^*]*)/i;
const OK_RE = /^Recv:\s*ok\b/i;

function param(text: string, letter: string): number | null {
  const match = new RegExp(`(?:^|\\s)${letter}\\s*(-?\\d+(?:\\.\\d+)?)`, 'i').exec(text);
  return match ? Number(match[1]) : null;
}

function parseWait(code: string, rest: string, activeTool: number): HeatupWait | null {
  if (code !== 'M109' && code !== 'M190' && code !== 'M191') return null;
  const s = param(rest, 'S');
  const r = param(rest, 'R');
  const target = s ?? r;
  if (target === null) return null;
  const tool = code === 'M109' ? param(rest, 'T') : null;
  const heater = code === 'M190' ? 'bed' : code === 'M191' ? 'chamber' : `tool${tool ?? activeTool}`;
  return { code, heater, tool, target, mode: s !== null ? 'S' : 'R' };
}

/** Applies log lines to `state` (mutated); returns true if something changed. */
export function applyHeatupLines(state: HeatupState, lines: readonly string[]): boolean {
  const before = JSON.stringify(state);
  for (const raw of lines) {
    const line = raw.trim();
    const send = SEND_RE.exec(line);
    if (send) {
      const code = send[1].toUpperCase();
      const tool = /^T(\d+)$/.exec(code);
      if (tool) state.activeTool = Number(tool[1]);
      state.wait = parseWait(code, send[2], state.activeTool);
    } else if (state.wait && OK_RE.test(line)) {
      state.wait = null;
    }
  }
  return JSON.stringify(state) !== before;
}

const SET_CODES: Record<string, [set: string, wait: WaitCode]> = {
  bed: ['M140', 'M190'],
  chamber: ['M141', 'M191'],
};
const codesFor = (heater: string) => SET_CODES[heater] ?? (['M104', 'M109'] as const);
const toolParam = (heater: string) => (heater.startsWith('tool') ? ` T${Number(heater.slice(4))}` : '');
const num = (v: number) => String(Number(v.toFixed(1)));

/**
 * Commands that apply `targets` (heater → °C, 0 = off) during `wait` without waiting for its end:
 * the other heaters are set, the waiting one waits again (for its new target, or the old one), and
 * M108 ends the current wait. `temps` are the current readings: a lower target waits with `R`
 * (`S` would not wait for the heater to cool down). Send them in one request, in this order.
 */
export function heatupOverrideCommands(
  wait: HeatupWait,
  targets: Record<string, number>,
  temps: Record<string, number | null | undefined>,
): string[] {
  const commands: string[] = [];
  for (const [heater, value] of Object.entries(targets)) {
    if (heater !== wait.heater) commands.push(`${codesFor(heater)[0]} S${num(value)}${toolParam(heater)}`);
  }
  const waitTool = wait.tool === null ? '' : ` T${wait.tool}`;
  const value = targets[wait.heater];
  if (value === undefined) {
    commands.push(`${wait.code} ${wait.mode}${num(wait.target)}${waitTool}`);
  } else if (value <= 0) {
    commands.push(`${codesFor(wait.heater)[0]} S0${waitTool}`);
  } else {
    const current = temps[wait.heater];
    const mode = current != null && value < current ? 'R' : 'S';
    commands.push(`${wait.code} ${mode}${num(value)}${waitTool}`);
  }
  commands.push('M108');
  return commands;
}
