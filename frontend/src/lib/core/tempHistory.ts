import type { HeaterReading, TemperatureSample } from '../api/types';

interface Series {
  actual: Float64Array;
  target: Float64Array;
}

export interface HistoryColumns {
  /** Seconds since the epoch (OctoPrint server time). */
  time: number[];
  series: Record<string, { actual: (number | null)[]; target: (number | null)[] }>;
}

/**
 * Fixed-size circular buffer of temperature samples (typed arrays, no allocation per sample).
 * Missing readings are stored as NaN and exposed as `null` (uPlot draws them as gaps).
 */
export class TemperatureHistory {
  private readonly times: Float64Array;
  private readonly data = new Map<string, Series>();
  private start = 0;
  private count = 0;

  constructor(readonly capacity = 2048) {
    this.times = new Float64Array(capacity);
  }

  get length(): number {
    return this.count;
  }

  get lastTime(): number | null {
    return this.count ? this.times[this.index(this.count - 1)] : null;
  }

  clear(): void {
    this.start = 0;
    this.count = 0;
    this.data.clear();
  }

  /** Adds samples in time order; samples not newer than the last one are ignored. */
  push(samples: readonly TemperatureSample[] | undefined): number {
    if (!samples?.length) return 0;
    let added = 0;
    for (const sample of [...samples].sort((a, b) => a.time - b.time)) {
      const last = this.lastTime;
      if (last !== null && sample.time <= last) continue;
      let slot: number;
      if (this.count < this.capacity) {
        slot = this.index(this.count++);
      } else {
        slot = this.start;
        this.start = (this.start + 1) % this.capacity;
      }
      this.times[slot] = sample.time;
      for (const series of this.data.values()) {
        series.actual[slot] = NaN;
        series.target[slot] = NaN;
      }
      for (const [key, value] of Object.entries(sample)) {
        if (key === 'time' || typeof value !== 'object' || value === null) continue;
        const series = this.series(key);
        series.actual[slot] = value.actual ?? NaN;
        series.target[slot] = value.target ?? NaN;
      }
      added++;
    }
    return added;
  }

  /** Heaters that reported at least one actual value (the Virtual Printer's null chamber is skipped). */
  heaters(): string[] {
    return [...this.data.entries()]
      .filter(([, s]) => this.someValue(s.actual))
      .map(([key]) => key);
  }

  /** Newest reading of every heater. */
  latest(): Record<string, HeaterReading> {
    const result: Record<string, HeaterReading> = {};
    if (!this.count) return result;
    const slot = this.index(this.count - 1);
    for (const [key, series] of this.data) {
      result[key] = { actual: toNull(series.actual[slot]), target: toNull(series.target[slot]) };
    }
    return result;
  }

  /** Columns of the last `seconds` (relative to the newest sample), ready for a chart. */
  columns(seconds = Infinity): HistoryColumns {
    const heaters = this.heaters();
    const result: HistoryColumns = { time: [], series: {} };
    for (const h of heaters) result.series[h] = { actual: [], target: [] };
    const last = this.lastTime;
    if (last === null) return result;
    for (let i = 0; i < this.count; i++) {
      const slot = this.index(i);
      if (last - this.times[slot] > seconds) continue;
      result.time.push(this.times[slot]);
      for (const h of heaters) {
        const series = this.data.get(h)!;
        result.series[h].actual.push(toNull(series.actual[slot]));
        result.series[h].target.push(toNull(series.target[slot]));
      }
    }
    return result;
  }

  private index(i: number): number {
    return (this.start + i) % this.capacity;
  }

  private series(key: string): Series {
    let series = this.data.get(key);
    if (!series) {
      series = {
        actual: new Float64Array(this.capacity).fill(NaN),
        target: new Float64Array(this.capacity).fill(NaN),
      };
      this.data.set(key, series);
    }
    return series;
  }

  private someValue(values: Float64Array): boolean {
    for (let i = 0; i < this.count; i++) if (!Number.isNaN(values[this.index(i)])) return true;
    return false;
  }
}

function toNull(value: number): number | null {
  return Number.isNaN(value) ? null : value;
}
