import { describe, expect, it } from 'vitest';
import { formatBytes, formatClock, formatDuration, formatTemp } from './format';

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
});
