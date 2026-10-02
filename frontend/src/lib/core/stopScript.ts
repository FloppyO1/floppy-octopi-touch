/**
 * What happens after Stop: OctoPrint runs its `afterPrintCancelled` G-code script for every cancel
 * (also from its own web interface). The dashboard checks that the script turns the motors, the
 * heaters and the part fan off, and can append only the lines that are missing.
 *
 * The script is a Jinja template; `{% snippet 'name' %}` pulls in `scripts.gcode["snippets/name"]`
 * (OctoPrint's default uses `disable_hotends` and `disable_bed`). Other tags are dropped, so
 * conditional lines count as present: the default `disable_bed` is `{% if heatedBed %}M140 S0…`.
 */

export const CANCEL_SCRIPT = 'afterPrintCancelled';

export interface StopProfile {
  extruders: number;
  /** One nozzle for every extruder (only `T0` needs turning off). */
  sharedNozzle: boolean;
  heatedBed: boolean;
}

export type CheckState = 'ok' | 'missing' | 'na';

export interface StopScriptStatus {
  motors: CheckState;
  hotends: CheckState;
  bed: CheckState;
  fan: CheckState;
  /** Lines the fix appends, in order (empty = nothing to do). */
  missing: string[];
}

const SNIPPET_RE = /\{%-?\s*snippet\s+['"]([\w-]+)['"]\s*-?%\}/g;
const MAX_DEPTH = 3;

/** Inlines the snippets (up to three levels deep), drops the other Jinja tags and comments. */
export function expandScript(script: string, scripts: Record<string, string | undefined>, depth = 0): string {
  const inlined = script.replace(SNIPPET_RE, (_m, name: string) =>
    depth < MAX_DEPTH ? `\n${expandScript(scripts[`snippets/${name}`] ?? '', scripts, depth + 1)}\n` : '\n',
  );
  return depth > 0
    ? inlined
    : inlined
        .replace(/\{#[\s\S]*?#\}/g, '')
        .replace(/\{%[\s\S]*?%\}/g, '\n');
}

interface Command {
  code: string;
  /** Parameter letter → value (`{{ tool }}` kept as text). */
  params: Map<string, string>;
}

/** G-code commands of the expanded script, comments and empty lines removed. */
export function parseCommands(text: string): Command[] {
  const commands: Command[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.replace(/;.*$/, '').trim();
    if (!line) continue;
    // `{{ tool }}` is one value, never two words.
    const words = line.replace(/\{\{.*?\}\}/g, '{}').split(/\s+/);
    const code = words[0].toUpperCase().replace(/^([GM])0+(\d)/, '$1$2');
    if (!/^[GMT]\d+$/.test(code)) continue;
    const params = new Map<string, string>();
    for (const word of words.slice(1)) params.set(word[0].toUpperCase(), word.slice(1));
    commands.push({ code, params });
  }
  return commands;
}

const isZero = (value: string | undefined) => value !== undefined && value !== '' && Number(value) === 0;

/** Tools turned off by `M104 S0` lines: a number, `all` (`T{{ tool }}`) or `active` (no T). */
function hotendsOff(commands: Command[]): Set<string> {
  const off = new Set<string>();
  for (const { code, params } of commands) {
    if ((code !== 'M104' && code !== 'M109') || !isZero(params.get('S'))) continue;
    const tool = params.get('T');
    off.add(tool === undefined ? 'active' : tool.includes('{}') ? 'all' : String(Number(tool)));
  }
  return off;
}

export function analyseStopScript(
  scripts: Record<string, string | undefined>,
  profile: StopProfile,
): StopScriptStatus {
  const commands = parseCommands(expandScript(scripts[CANCEL_SCRIPT] ?? '', scripts));
  const has = (test: (c: Command) => boolean) => commands.some(test);

  // M84/M18 S<n> only sets the idle timeout; with axes, X Y and Z must all be there.
  const motors = has(({ code, params }) => {
    if ((code !== 'M84' && code !== 'M18') || params.has('S')) return false;
    const axes = ['X', 'Y', 'Z', 'E'].filter((a) => params.has(a));
    return axes.length === 0 || ['X', 'Y', 'Z'].every((a) => params.has(a));
  });

  const tools = profile.sharedNozzle ? 1 : Math.max(1, profile.extruders);
  const off = hotendsOff(commands);
  const toolIds = Array.from({ length: tools }, (_, i) => String(i));
  const allTools = off.has('all') || (tools === 1 && off.has('active')) || toolIds.every((id) => off.has(id));
  const missingTools = allTools ? [] : toolIds.filter((id) => !off.has(id));

  const bed = !profile.heatedBed
    ? 'na'
    : has(({ code, params }) => (code === 'M140' || code === 'M190') && isZero(params.get('S')))
      ? 'ok'
      : 'missing';

  const fan = has(({ code, params }) => code === 'M107' || (code === 'M106' && isZero(params.get('S'))));

  const missing = [
    ...missingTools.map((id) => `M104 T${id} S0`),
    ...(bed === 'missing' ? ['M140 S0'] : []),
    ...(fan ? [] : ['M106 S0']),
    ...(motors ? [] : ['M84']),
  ];
  return {
    motors: motors ? 'ok' : 'missing',
    hotends: allTools ? 'ok' : 'missing',
    bed,
    fan: fan ? 'ok' : 'missing',
    missing,
  };
}

/** Marks the lines the fix adds, so they are recognisable in OctoPrint's settings. */
export const FIX_COMMENT = '; added by FloppyOctoTouch: turn everything off after Stop';

/** The user's script untouched, then the missing lines. */
export function fixStopScript(script: string, missing: readonly string[]): string {
  if (!missing.length) return script;
  const body = script.replace(/\s+$/, '');
  return `${body ? `${body}\n\n` : ''}${FIX_COMMENT}\n${missing.join('\n')}\n`;
}
