/**
 * Leveling screen actions: paper test moves, mesh read/probe, manual mesh (MBL), babystep, probe
 * Z offset and EEPROM save. Answers come back through the terminal log (`leveling` store).
 */
import {
  AUTO_LEVEL_GCODE,
  babystepGcode,
  liftGcode,
  MBL_NEXT_GCODE,
  MBL_START_GCODE,
  pointGcode,
  READ_MESH_GCODE,
  setProbeOffsetGcode,
  type LevelingPoint,
} from '../../lib/core/leveling';
import { t } from '../../lib/i18n/index.svelte';
import { leveling, printer, settings, terminal } from '../../lib/stores';
import { dialogs } from '../../lib/ui/dialogs.svelte';
import { toast } from '../../lib/ui/toast.svelte';

const idle = () => printer.operational && !printer.busy;

async function send(commands: string | string[]): Promise<boolean> {
  try {
    await terminal.send(commands);
    return true;
  } catch {
    toast.show(t('move.failed'), { tone: 'error' });
    return false;
  }
}

const travel = () => ({
  zHop: settings.value.leveling.zHop,
  xyFeedrate: settings.value.move.xyFeedrate,
  zFeedrate: settings.value.move.zFeedrate,
});

export async function homeAll(): Promise<void> {
  if (!idle()) return;
  try {
    await printer.home(['x', 'y', 'z']);
  } catch {
    toast.show(t('idle.homeFailed'), { tone: 'error' });
  }
}

/** Paper test: lift, travel to the point, nozzle down to Z0. */
export async function goToPoint(point: LevelingPoint): Promise<void> {
  if (!idle() || !printer.homed) return;
  leveling.point = point.id;
  if (await send(pointGcode(point, travel()))) void printer.requestPosition().catch(() => undefined);
}

export async function finishPaperTest(): Promise<void> {
  if (!idle()) return;
  leveling.point = null;
  if (await send(liftGcode(travel()))) void printer.requestPosition().catch(() => undefined);
}

export async function readMesh(): Promise<void> {
  if (!idle()) return;
  if (await send(READ_MESH_GCODE)) toast.show(t('leveling.reading'));
}

export async function autoLevel(): Promise<void> {
  if (!idle()) return;
  const ok = await dialogs.confirm({
    title: t('leveling.autoTitle'),
    message: t('leveling.autoMessage'),
    confirmLabel: t('leveling.autoStart'),
    tone: 'warning',
  });
  if (ok && (await send(AUTO_LEVEL_GCODE))) toast.show(t('leveling.autoStarted'));
}

export async function mblStart(): Promise<void> {
  if (!idle() || leveling.mbl) return;
  const ok = await dialogs.confirm({
    title: t('leveling.mblTitle'),
    message: t('leveling.mblMessage'),
    confirmLabel: t('leveling.mblStart'),
  });
  if (!ok) return;
  leveling.mbl = { point: 1 };
  leveling.point = null;
  if (!(await send(MBL_START_GCODE))) leveling.mbl = null;
}

/** MBL: move the nozzle while it rests on a point (soft endstops are loose during G29 S1/S2). */
export async function mblAdjust(direction: 1 | -1): Promise<void> {
  if (!leveling.mbl) return;
  const step = settings.value.leveling.meshStep;
  try {
    await printer.jog('z', direction * step, settings.value.move.zFeedrate);
  } catch {
    toast.show(t('move.failed'), { tone: 'error' });
  }
}

/** MBL: store Z of this point and move to the next one (the last one ends the procedure). */
export async function mblNext(): Promise<void> {
  const run = leveling.mbl;
  if (!run) return;
  if (await send(MBL_NEXT_GCODE)) leveling.mbl = { point: run.point + 1 };
}

export async function mblCancel(): Promise<void> {
  if (!leveling.mbl) return;
  const ok = await dialogs.confirm({
    title: t('leveling.mblCancelTitle'),
    message: t('leveling.mblCancelMessage'),
    confirmLabel: t('leveling.mblCancel'),
    tone: 'warning',
  });
  if (!ok) return;
  leveling.mbl = null;
  // Marlin re-enables the soft endstops only at the end of G29: homing again restores a sane state.
  await send('G28');
}

/** Babystep (also while printing): `direction` +1 = nozzle away from the bed. */
export async function babystep(direction: 1 | -1): Promise<void> {
  if (!printer.operational) return;
  const amount = direction * settings.value.leveling.babystep;
  if (await send(babystepGcode(amount))) {
    leveling.babystepTotal = Number((leveling.babystepTotal + amount).toFixed(3));
  }
}

export async function readProbeOffset(): Promise<void> {
  if (printer.operational) await send('M851');
}

export async function setProbeOffset(): Promise<void> {
  if (!idle()) return;
  const value = await dialogs.number({
    title: t('leveling.probeOffset'),
    value: leveling.probeOffsetZ,
    unit: 'mm',
    min: -10,
    max: 10,
    decimals: 2,
  });
  if (value === null) return;
  await send([setProbeOffsetGcode(value), 'M851']);
}

export async function saveEeprom(): Promise<void> {
  if (!idle()) return;
  const ok = await dialogs.confirm({
    title: t('leveling.saveTitle'),
    message: t('leveling.saveMessage'),
    confirmLabel: t('leveling.save'),
  });
  if (ok && (await send('M500'))) toast.show(t('leveling.saved'), { tone: 'ok' });
}
