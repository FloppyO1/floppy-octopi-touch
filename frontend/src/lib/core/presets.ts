/** Temperature presets: validation behind the preset manager (list operations in `lists.ts`). */
import { moveById, nameTaken, removeById, upsertById } from './lists';
import type { TemperaturePreset } from './settings';

export const PRESET_NAME_MAX = 24;

export const movePreset = moveById<TemperaturePreset>;
export const upsertPreset = upsertById<TemperaturePreset>;
export const removePreset = removeById<TemperaturePreset>;

export type PresetError = 'name' | 'duplicate' | 'hotend' | 'bed' | 'fan';

/** First problem of a preset being edited, `null` when it can be saved. */
export function validatePreset(
  preset: TemperaturePreset,
  list: readonly TemperaturePreset[],
  max: { hotend: number; bed: number },
): PresetError | null {
  const name = preset.name.trim();
  if (!name || name.length > PRESET_NAME_MAX) return 'name';
  if (nameTaken(list, preset.id, name)) return 'duplicate';
  if (!(preset.hotend >= 0 && preset.hotend <= max.hotend)) return 'hotend';
  if (!(preset.bed >= 0 && preset.bed <= max.bed)) return 'bed';
  if (preset.fan !== null && !(preset.fan >= 0 && preset.fan <= 100)) return 'fan';
  return null;
}
