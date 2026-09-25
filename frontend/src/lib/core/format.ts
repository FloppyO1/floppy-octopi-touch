/** Locale-neutral formatting helpers used across screens. */

export function formatTemp(value: number | null | undefined, digits = 0): string {
  return value == null ? '—' : `${value.toFixed(digits)}°C`;
}

/** `3725` → `1:02:05`, `125` → `2:05`; `null` → `—`. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value >= 100 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** Wall clock, always 24 h unless `hour12` (the Pi's time zone applies). */
export function formatClock(date: Date, hour12 = false, seconds = false): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: seconds ? '2-digit' : undefined,
    hourCycle: hour12 ? 'h12' : 'h23',
  }).format(date);
}

/** Date and time of a file (`date` in seconds since the epoch), e.g. "25 Sep 2026, 14:05". */
export function formatFileDate(seconds: number | null | undefined, locale?: string, hour12 = false): string {
  if (!seconds) return '—';
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: hour12 ? 'h12' : 'h23',
  }).format(new Date(seconds * 1000));
}
