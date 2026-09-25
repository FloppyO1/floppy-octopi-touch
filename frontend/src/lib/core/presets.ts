/** Temperature presets: pure list operations behind the preset manager (the order is the display order). */
import type { TemperaturePreset } from './settings';

export const PRESET_NAME_MAX = 24;

/** Moves the preset `id` one place up (-1) or down (+1); unchanged at the ends. */
export function movePreset(list: readonly TemperaturePreset[], id: string, direction: -1 | 1): TemperaturePreset[] {
  const from = list.findIndex((p) => p.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= list.length) return [...list];
  const out = [...list];
  [out[from], out[to]] = [out[to], out[from]];
  return out;
}

/** Replaces the preset with the same id, or appends it. */
export function upsertPreset(list: readonly TemperaturePreset[], preset: TemperaturePreset): TemperaturePreset[] {
  const index = list.findIndex((p) => p.id === preset.id);
  if (index < 0) return [...list, preset];
  const out = [...list];
  out[index] = preset;
  return out;
}

export function removePreset(list: readonly TemperaturePreset[], id: string): TemperaturePreset[] {
  return list.filter((p) => p.id !== id);
}

export type PresetError = 'name' | 'duplicate' | 'hotend' | 'bed' | 'fan';

/** First problem of a preset being edited, `null` when it can be saved. */
export function validatePreset(
  preset: TemperaturePreset,
  list: readonly TemperaturePreset[],
  max: { hotend: number; bed: number },
): PresetError | null {
  const name = preset.name.trim();
  if (!name || name.length > PRESET_NAME_MAX) return 'name';
  const key = name.toLocaleLowerCase();
  if (list.some((p) => p.id !== preset.id && p.name.trim().toLocaleLowerCase() === key)) return 'duplicate';
  if (!(preset.hotend >= 0 && preset.hotend <= max.hotend)) return 'hotend';
  if (!(preset.bed >= 0 && preset.bed <= max.bed)) return 'bed';
  if (preset.fan !== null && !(preset.fan >= 0 && preset.fan <= 100)) return 'fan';
  return null;
}
