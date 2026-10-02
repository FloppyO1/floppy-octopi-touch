/**
 * Heater targets: tap on a gauge (NumPad with presets), preheat presets and cooldown, all with the
 * confirmation above the configured threshold. Every change goes through `applyTargets()`, which
 * also handles a blocking heat-up wait (M109/M190) of a running print.
 */
import type { TemperaturePreset } from '../lib/core/settings';
import { t } from '../lib/i18n/index.svelte';
import { capabilities, printer, settings, temperatures, tune } from '../lib/stores';
import { dialogs } from '../lib/ui/dialogs.svelte';
import { toast } from '../lib/ui/toast.svelte';

/**
 * Sends `targets` (heater → °C). During a heat-up wait they apply at once with EMERGENCY_PARSER,
 * otherwise only when the wait ends: the toast says which. `okMessage` is shown otherwise.
 * Returns false (after an error toast) if OctoPrint refused them.
 */
export async function applyTargets(targets: Record<string, number>, okMessage?: string): Promise<boolean> {
  try {
    const delivery = await temperatures.setTargets(targets, capabilities.has('emergencyParser'));
    if (delivery === 'interrupted') toast.show(t('temps.appliedNow'), { tone: 'ok', durationMs: 5000 });
    else if (delivery === 'afterWait') toast.show(t('temps.afterWait'), { tone: 'warning', durationMs: 8000 });
    else if (okMessage) toast.show(okMessage, { tone: 'ok' });
    return true;
  } catch {
    toast.show(t('temps.setFailed'), { tone: 'error' });
    return false;
  }
}

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
  await applyTargets({ [heater]: value });
}

/** Asks for confirmation if `value` is above the configured threshold of `heater`. */
export async function confirmHigh(heater: string, value: number): Promise<boolean> {
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
  if (!(await applyTargets({ tool0: preset.hotend, bed: preset.bed }, t('temps.preheating', { name: preset.name })))) {
    return;
  }
  if (preset.fan !== null) await tune.setFan(preset.fan).catch(() => toast.show(t('temps.setFailed'), { tone: 'error' }));
}

export async function cooldown(): Promise<void> {
  await applyTargets(Object.fromEntries(temperatures.heaters.map((h) => [h, 0])), t('temps.cooling'));
}

/** Turns one heater off; during a job this ruins the print, so it asks first. */
export async function heaterOff(heater: string): Promise<void> {
  if (printer.busy && !(await confirmOffWhilePrinting(t(`heater.${heater}`)))) return;
  await applyTargets({ [heater]: 0 });
}

/** "All off" of the Temperature screen: like `cooldown()`, with the same guard as `heaterOff()`. */
export async function allHeatersOff(): Promise<void> {
  if (printer.busy && !(await confirmOffWhilePrinting(t('temps.allHeaters')))) return;
  await cooldown();
}

function confirmOffWhilePrinting(what: string): Promise<boolean> {
  return dialogs.confirm({
    title: t('temps.offPrintingTitle'),
    message: t('temps.offPrintingMessage', { heater: what }),
    confirmLabel: t('temps.turnOff'),
    tone: 'danger',
  });
}
