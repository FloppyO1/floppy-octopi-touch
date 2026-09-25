import { describe, expect, it } from 'vitest';
import { latestTemperatures } from './temperatures';
import { backoffDelay } from './socket';

describe('latestTemperatures', () => {
  it('returns null without samples', () => {
    expect(latestTemperatures([])).toBeNull();
    expect(latestTemperatures(undefined)).toBeNull();
  });

  it('picks the newest sample and keeps only heaters', () => {
    const temps = [
      { time: 2, tool0: { actual: 200.5, target: 210 }, bed: { actual: 60, target: 60 } },
      { time: 1, tool0: { actual: 20, target: 0 }, bed: { actual: 21, target: 0 } },
    ];
    expect(latestTemperatures(temps)).toEqual({
      tool0: { actual: 200.5, target: 210 },
      bed: { actual: 60, target: 60 },
    });
  });

  it('normalises missing values to null', () => {
    const temps = [{ time: 1, chamber: { actual: null, target: null } }];
    expect(latestTemperatures(temps)).toEqual({ chamber: { actual: null, target: null } });
  });
});

describe('backoffDelay', () => {
  it('grows exponentially and is capped', () => {
    expect([0, 1, 2, 3].map((n) => backoffDelay(n))).toEqual([1000, 2000, 4000, 8000]);
    expect(backoffDelay(10)).toBe(15000);
  });
});
