/** Move screen actions: jog inside the build volume, homing, motors off. */
import type { Axis } from '../../lib/api/types';
import { axisBounds, planJog } from '../../lib/core/move';
import { t } from '../../lib/i18n/index.svelte';
import { printer, server, settings } from '../../lib/stores';
import { toast } from '../../lib/ui/toast.svelte';

/** Jog button: `direction` as seen on screen (+ = right, back, up). */
export async function jog(axis: Axis, direction: 1 | -1): Promise<void> {
  if (!printer.operational || printer.busy) return;
  const { step, xyFeedrate, zFeedrate } = settings.value.move;
  const plan = planJog(direction, step, {
    position: printer.position?.[axis],
    bounds: axisBounds(server.profile)?.[axis],
    inverted: server.profile?.axes?.[axis]?.inverted,
  });
  if (plan.amount === 0) {
    toast.show(t('move.atLimit', { axis: axis.toUpperCase() }), { tone: 'warning' });
    return;
  }
  try {
    await printer.jog(axis, plan.amount, axis === 'z' ? zFeedrate : xyFeedrate);
  } catch {
    toast.show(t('move.failed'), { tone: 'error' });
  }
}

export async function home(axes: Axis[]): Promise<void> {
  if (!printer.operational || printer.busy) return;
  try {
    await printer.home(axes);
  } catch {
    toast.show(t('idle.homeFailed'), { tone: 'error' });
  }
}

export async function motorsOff(): Promise<void> {
  if (!printer.operational || printer.busy) return;
  try {
    await printer.motorsOff();
    toast.show(t('move.motorsOffDone'), { tone: 'ok' });
  } catch {
    toast.show(t('move.failed'), { tone: 'error' });
  }
}

export async function readPosition(): Promise<void> {
  try {
    await printer.requestPosition();
  } catch {
    toast.show(t('move.failed'), { tone: 'error' });
  }
}
