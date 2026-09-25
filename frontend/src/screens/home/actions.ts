/** Home screen actions: print control with confirmations and the live overrides (sliders). */
import Fan from '@lucide/svelte/icons/fan';
import Gauge from '@lucide/svelte/icons/gauge';
import Waves from '@lucide/svelte/icons/waves';
import type { FileOrigin } from '../../lib/api/types';
import { t } from '../../lib/i18n/index.svelte';
import { files, job, printer, tune } from '../../lib/stores';
import { dialogs } from '../../lib/ui/dialogs.svelte';
import { toast } from '../../lib/ui/toast.svelte';

async function run(action: () => Promise<unknown>, failure: string): Promise<void> {
  try {
    await action();
  } catch {
    toast.show(t(failure), { tone: 'error' });
  }
}

export async function pausePrint(): Promise<void> {
  const ok = await dialogs.confirm({
    title: t('job.pauseTitle'),
    message: t('job.pauseMessage'),
    confirmLabel: t('job.pause'),
    tone: 'warning',
  });
  if (ok) await run(job.pause, 'job.failed');
}

export const resumePrint = () => run(job.resume, 'job.failed');

export async function stopPrint(): Promise<void> {
  const ok = await dialogs.confirm({
    title: t('job.stopTitle'),
    message: t('job.stopMessage'),
    confirmLabel: t('job.stop'),
    tone: 'danger',
  });
  if (ok) await run(job.cancel, 'job.failed');
}

/** Starts a print after a reminder that the bed must be clear. */
export async function startPrint(origin: FileOrigin, path: string, name: string): Promise<void> {
  if (!printer.operational || printer.busy) return;
  const ok = await dialogs.confirm({
    title: t('job.startTitle'),
    message: t('job.startMessage', { name }),
    confirmLabel: t('job.print'),
    tone: 'primary',
  });
  if (ok) await run(() => files.print(origin, path), 'job.failed');
}

export async function askFan(): Promise<void> {
  const value = await dialogs.slider({
    title: t('tune.fan'),
    icon: Fan,
    value: tune.fan ?? 0,
    min: 0,
    max: 100,
    step: 1,
    fineStep: 5,
    unit: '%',
    presets: [0, 25, 50, 75, 100].map((v) => ({ value: v, label: v ? `${v}%` : t('tune.off') })),
  });
  if (value !== null) await run(() => tune.setFan(value), 'tune.failed');
}

export async function askFeedrate(): Promise<void> {
  const value = await dialogs.slider({
    title: t('tune.feedrate'),
    icon: Gauge,
    value: tune.feedrate,
    min: 50,
    max: 200,
    step: 5,
    fineStep: 1,
    unit: '%',
    presets: [75, 90, 100, 110, 125].map((v) => ({ value: v, label: `${v}%` })),
  });
  if (value !== null) await run(() => tune.setFeedrate(value), 'tune.failed');
}

export async function askFlow(): Promise<void> {
  const value = await dialogs.slider({
    title: t('tune.flow'),
    icon: Waves,
    value: tune.flow,
    min: 75,
    max: 125,
    step: 1,
    unit: '%',
    presets: [90, 95, 100, 105, 110].map((v) => ({ value: v, label: `${v}%` })),
  });
  if (value !== null) await run(() => tune.setFlow(value), 'tune.failed');
}
