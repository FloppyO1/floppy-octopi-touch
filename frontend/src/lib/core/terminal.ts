/**
 * Terminal log: line kinds, filters and command history (pure). OctoPrint logs every line it sends
 * as `Send: …` and every answer as `Recv: …`; other lines are its own messages (state changes,
 * connection). The filters follow OctoPrint's own terminal filters.
 */

export const TERMINAL_FILTERS = ['temperature', 'ok', 'busy', 'sd', 'position'] as const;
export type TerminalFilter = (typeof TERMINAL_FILTERS)[number];
/** `true` = lines of that kind are hidden. */
export type TerminalFilters = Record<TerminalFilter, boolean>;

export function defaultTerminalFilters(): TerminalFilters {
  return { temperature: true, ok: false, busy: true, sd: true, position: false };
}

const SEND = String.raw`^Send:\s*(?:N\d+\s+)?`;
const FILTER_RES: Record<TerminalFilter, RegExp> = {
  // M105 and its answer (`ok T:…`), temperature auto-reports (`T:… B:…`).
  temperature: new RegExp(String.raw`${SEND}M105(?![0-9])|^Recv:\s*(?:ok\s+(?:[PBN]\d+\s+)*)?(?:[BCLPR]|T\d*):\s*-?\d`, 'i'),
  ok: /^Recv:\s*ok(?:\s+[NPB]\d+)*\s*$/i,
  busy: /^Recv:\s*(?:echo:\s*)?busy:\s*processing|^Recv:\s*wait\s*$/i,
  sd: new RegExp(String.raw`${SEND}M27(?![0-9])|^Recv:\s*(?:SD printing byte|Not SD printing)`, 'i'),
  // The dashboard's own position requests (M400 + M114) and their answers.
  position: new RegExp(String.raw`${SEND}M(?:114|400)(?![0-9])|^Recv:\s*(?:ok\s+)?X:\s*-?\d+(?:\.\d+)?\s+Y:`, 'i'),
};

/** The filter a line belongs to, `null` if it is always shown. */
export function lineFilter(text: string): TerminalFilter | null {
  for (const filter of TERMINAL_FILTERS) if (FILTER_RES[filter].test(text)) return filter;
  return null;
}

export type LineKind = 'send' | 'recv' | 'error' | 'warning' | 'info';

export function lineKind(text: string): LineKind {
  if (/^Recv:\s*(?:Error|!!)/i.test(text) || /^(?:Unexpected error|Error:)/i.test(text)) return 'error';
  if (/^Recv:\s*echo:\s*(?:Unknown command|Invalid)/i.test(text) || /^WARN/i.test(text)) return 'warning';
  if (text.startsWith('Send:')) return 'send';
  if (text.startsWith('Recv:')) return 'recv';
  return 'info';
}

/** The lines to show: filtered, then the newest `limit` ones. */
export function visibleLines<T extends { text: string }>(lines: readonly T[], filters: TerminalFilters, limit: number): T[] {
  const active = TERMINAL_FILTERS.filter((f) => filters[f]);
  const out: T[] = [];
  for (let i = lines.length - 1; i >= 0 && out.length < limit; i--) {
    const filter = active.length ? lineFilter(lines[i].text) : null;
    if (filter === null || !filters[filter]) out.push(lines[i]);
  }
  return out.reverse();
}

/** Command as sent: trimmed, inner runs of spaces collapsed. */
export function normalizeCommand(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

export const HISTORY_MAX = 30;

/** Newest first, without duplicates. */
export function pushHistory(history: readonly string[], command: string, max = HISTORY_MAX): string[] {
  return [command, ...history.filter((c) => c !== command)].slice(0, max);
}
