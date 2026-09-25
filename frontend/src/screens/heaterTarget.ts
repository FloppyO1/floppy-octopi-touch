/**
 * Heater targets: tap on a gauge (NumPad with presets), preheat presets and cooldown, all with the
 * confirmation above the configured threshold.
 */
import type { TemperaturePreset } from '../lib/core/settings';
import { t } from '../lib/i18n/index.svelte';
import { settings, temperatures, tune } from '../lib/stores';
import { dialogs } from '../lib/ui/dialogs.svelte';
import { toast } from '../lib/ui/toast.svelte';

export async function askHeaterTarget(heater: string): Promise<void> {
  const isBed = heater === 'bed';
  const limits = settings.value.temperature;
  const name = t(`heater.${heater}`);
  const value = await dialogs.number({
    title: t('temps.setTarget', { heater: name }),
    value: temperatures.latest[heater]?.target ?? 0,
    unit: '°C',
    min: 0,
    max: isBed ? limits.max.bed : limits.max.hotend,
    presets: [
      { label: t('temps.offPreset'), value: 0 },
      ...settings.value.presets.map((p) => ({ label: p.name, value: isBed ? p.bed : p.hotend })),
    ],
  });
  if (value === null) return;
  if (!(await confirmHigh(heater, value))) return;
  try {
    await temperatures.setTarget(heater, value);
  } catch {
    toast.show(t('temps.setFailed'), { tone: 'error' });
  }
}

/** Asks for confirmation if `value` is above the configured threshold of `heater`. */
async function confirmHigh(heater: string, value: number): Promise<boolean> {
  const limits = settings.value.temperature.confirmAbove;
  const confirmAbove = heater === 'bed' ? limits.bed : limits.hotend;
  if (value <= confirmAbove) return true;
  return dialogs.confirm({
    title: t('temps.highTitle'),
    message: t('temps.highMessage', { heater: t(`heater.${heater}`), value, limit: confirmAbove }),
    confirmLabel: t('temps.highConfirm', { value }),
    tone: 'warning',
  });
}

/** Heats hotend and bed to a preset (and sets its fan, if any). */
export async function preheat(preset: TemperaturePreset): Promise<void> {
  if (!(await confirmHigh('tool0', preset.hotend)) || !(await confirmHigh('bed', preset.bed))) return;
  try {
    await Promise.all([
      temperatures.setTarget('tool0', preset.hotend),
      temperatures.setTarget('bed', preset.bed),
      preset.fan === null ? undefined : tune.setFan(preset.fan),
    ]);
    toast.show(t('temps.preheating', { name: preset.name }), { tone: 'ok' });
  } catch {
    toast.show(t('temps.setFailed'), { tone: 'error' });
  }
}

export async function cooldown(): Promise<void> {
  try {
    await temperatures.allOff();
    toast.show(t('temps.cooling'), { tone: 'ok' });
  } catch {
    toast.show(t('temps.setFailed'), { tone: 'error' });
  }
}
