import { describe, expect, it } from 'vitest';
import { formatBytes, formatClock, formatDuration, formatFileDate, formatLongDate, formatTemp, useTimeZone } from './format';

describe('format', () => {
  it('formats temperatures', () => {
    expect(formatTemp(null)).toBe('—');
    expect(formatTemp(199.6)).toBe('200°C');
    expect(formatTemp(60.04, 1)).toBe('60.0°C');
  });

  it('formats durations', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(125)).toBe('2:05');
    expect(formatDuration(3725)).toBe('1:02:05');
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(15005)).toBe('14.7 KB');
    expect(formatBytes(1013597384704)).toBe('944 GB');
  });

  it('uses a 24 h clock by default', () => {
    expect(formatClock(new Date(2026, 0, 1, 18, 5, 9), false, true)).toMatch(/18.05.09/);
  });

  it('shows wall-clock times in the time zone of the Pi', () => {
    let zone: string | undefined = 'Europe/Rome';
    useTimeZone(() => zone);
    const moment = new Date(Date.UTC(2026, 6, 1, 22, 30));
    expect(formatClock(moment)).toMatch(/00.30/);
    expect(formatLongDate(moment, 'en-GB')).toBe('Thursday 2 July');
    zone = 'America/Sao_Paulo';
    expect(formatClock(moment)).toMatch(/19.30/);
    expect(formatFileDate(moment.getTime() / 1000, 'en-GB')).toBe('1 Jul 2026, 19:30');
    useTimeZone(() => undefined);
  });
});
