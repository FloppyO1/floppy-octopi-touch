/**
 * Time zones of the Pi (System → Settings → Date and time): the `timedatectl list-timezones` names
 * split into a region and a city for the two-level picker, offsets, and the manual clock.
 */

/** Zones without a region ("UTC") are listed under this key. */
export const OTHER_REGION = 'Other';

export interface ZoneEntry {
  /** IANA name sent to the agent, e.g. `America/Argentina/Buenos_Aires`. */
  zone: string;
  /** What the list shows, e.g. `Argentina / Buenos Aires`. */
  label: string;
}

/** `Europe/Rome` → `{ region: 'Europe', city: 'Rome' }`; `UTC` → region `Other`. */
export function splitZone(zone: string): { region: string; city: string } {
  const slash = zone.indexOf('/');
  if (slash < 0) return { region: OTHER_REGION, city: zone };
  return { region: zone.slice(0, slash), city: zone.slice(slash + 1) };
}

export function cityLabel(city: string): string {
  return city.replaceAll('_', ' ').replaceAll('/', ' / ');
}

/** Regions in alphabetical order (`Other` last), each with its cities sorted by label. */
export function groupZones(zones: readonly string[]): Map<string, ZoneEntry[]> {
  const groups = new Map<string, ZoneEntry[]>();
  for (const zone of zones) {
    const { region, city } = splitZone(zone);
    const list = groups.get(region) ?? [];
    list.push({ zone, label: cityLabel(city) });
    groups.set(region, list);
  }
  const regions = [...groups.keys()].sort((a, b) =>
    a === OTHER_REGION ? 1 : b === OTHER_REGION ? -1 : a.localeCompare(b),
  );
  return new Map(regions.map((r) => [r, groups.get(r)!.sort((a, b) => a.label.localeCompare(b.label))]));
}

/** Case- and accent-insensitive match on the label or the IANA name ("buenos", "sao paulo"). */
export function filterZones(entries: readonly ZoneEntry[], query: string): ZoneEntry[] {
  const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const words = fold(query).split(/[\s_/]+/).filter(Boolean);
  if (!words.length) return [...entries];
  return entries.filter((e) => {
    const text = fold(`${e.label} ${e.zone}`).replaceAll('_', ' ');
    return words.every((w) => text.includes(w));
  });
}

/** `120` → `UTC+02:00`, `-210` → `UTC−03:30`, `0` → `UTC`. */
export function formatOffset(minutes: number | null | undefined): string {
  if (minutes == null) return '';
  if (minutes === 0) return 'UTC';
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Whether this browser can format times in `zone` (Chromium ships the full ICU data). */
export function isUsableTimeZone(zone: string | null | undefined): zone is string {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** Wall clock fields of a moment in a time zone (what the manual clock editor starts from). */
export interface ClockFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function clockFields(date: Date, timeZone?: string): ClockFields {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute') };
}

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Same limits as the agent (2020-2099), day clamped to the month. */
export function clampFields(f: ClockFields): ClockFields {
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));
  const year = clamp(f.year, 2020, 2099);
  const month = clamp(f.month, 1, 12);
  return {
    year,
    month,
    day: clamp(f.day, 1, daysInMonth(year, month)),
    hour: clamp(f.hour, 0, 23),
    minute: clamp(f.minute, 0, 59),
  };
}

/** `YYYY-MM-DD HH:MM:00`, the format `POST /local/time` and `timedatectl set-time` take. */
export function toTimedatectl(f: ClockFields): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(f.year, 4)}-${pad(f.month)}-${pad(f.day)} ${pad(f.hour)}:${pad(f.minute)}:00`;
}

/** Manual fields as the user reads them ("Friday 2 October 2026, 18:30"), whatever the zone. */
export function formatFields(f: ClockFields, locale?: string, hour12 = false): string {
  // The fields are a wall-clock time: format them as UTC so no zone shifts them.
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: hour12 ? 'h12' : 'h23',
    timeZone: 'UTC',
  }).format(Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute));
}
