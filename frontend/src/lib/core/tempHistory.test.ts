import { describe, expect, it } from 'vitest';
import type { TemperatureSample } from '../api/types';
import { TemperatureHistory } from './tempHistory';

const sample = (time: number, tool: number, bed: number | null = 60): TemperatureSample => ({
  time,
  tool0: { actual: tool, target: 200 },
  bed: { actual: bed, target: 60 },
  chamber: { actual: null, target: null },
});

describe('TemperatureHistory', () => {
  it('stores samples in order and exposes the latest reading', () => {
    const history = new TemperatureHistory(8);
    expect(history.push([sample(2, 25), sample(1, 20)])).toBe(2);
    expect(history.length).toBe(2);
    expect(history.lastTime).toBe(2);
    expect(history.latest().tool0).toEqual({ actual: 25, target: 200 });
  });

  it('skips duplicates and older samples', () => {
    const history = new TemperatureHistory(8);
    history.push([sample(5, 30)]);
    expect(history.push([sample(5, 31), sample(4, 29)])).toBe(0);
    expect(history.length).toBe(1);
  });

  it('wraps around when full, keeping the newest samples', () => {
    const history = new TemperatureHistory(3);
    history.push([1, 2, 3, 4, 5].map((t) => sample(t, t * 10)));
    const columns = history.columns();
    expect(columns.time).toEqual([3, 4, 5]);
    expect(columns.series.tool0.actual).toEqual([30, 40, 50]);
  });

  it('lists only heaters with readings and turns gaps into null', () => {
    const history = new TemperatureHistory(8);
    history.push([sample(1, 20, null), sample(2, 21, 55)]);
    expect(history.heaters()).toEqual(['tool0', 'bed']);
    expect(history.columns().series.bed.actual).toEqual([null, 55]);
    expect(history.latest().chamber).toEqual({ actual: null, target: null });
  });

  it('handles heaters that appear later', () => {
    const history = new TemperatureHistory(8);
    history.push([{ time: 1, tool0: { actual: 20, target: 0 } }]);
    history.push([sample(2, 21)]);
    expect(history.columns().series.bed.actual).toEqual([null, 60]);
  });

  it('limits columns to a time window relative to the newest sample', () => {
    const history = new TemperatureHistory(16);
    history.push([0, 60, 120, 180].map((t) => sample(t, 20)));
    expect(history.columns(120).time).toEqual([60, 120, 180]);
  });

  it('clears everything', () => {
    const history = new TemperatureHistory(4);
    history.push([sample(1, 20)]);
    history.clear();
    expect(history.length).toBe(0);
    expect(history.heaters()).toEqual([]);
    expect(history.latest()).toEqual({});
  });
});
