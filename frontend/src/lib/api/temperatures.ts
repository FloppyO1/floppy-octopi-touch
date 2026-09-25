import type { HeaterReading, TemperatureSample } from './types';

export type Temperatures = Record<string, HeaterReading>;

/** Extracts the heaters (tool0, bed, …) from the newest sample of a `temps` array. */
export function latestTemperatures(temps: TemperatureSample[] | undefined): Temperatures | null {
  if (!temps || temps.length === 0) return null;
  const newest = temps.reduce((a, b) => (b.time > a.time ? b : a));
  const result: Temperatures = {};
  for (const [key, value] of Object.entries(newest)) {
    if (key === 'time' || typeof value !== 'object' || value === null) continue;
    result[key] = { actual: value.actual ?? null, target: value.target ?? null };
  }
  return result;
}
