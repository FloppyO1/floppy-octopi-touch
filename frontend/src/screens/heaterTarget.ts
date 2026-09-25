/** Tap on a heater: NumPad with presets, confirmation above the configured threshold, then set the target. */
import { t } from '../lib/i18n/index.svelte';
import { settings, temperatures } from '../lib/stores';
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

  const confirmAbove = isBed ? limits.confirmAbove.bed : limits.confirmAbove.hotend;
  if (value > confirmAbove) {
    const ok = await dialogs.confirm({
      title: t('temps.highTitle'),
      message: t('temps.highMessage', { heater: name, value, limit: confirmAbove }),
      confirmLabel: t('temps.highConfirm', { value }),
      tone: 'warning',
    });
    if (!ok) return;
  }
  try {
    await temperatures.setTarget(heater, value);
  } catch {
    toast.show(t('temps.setFailed'), { tone: 'error' });
  }
}
