/**
 * Filament wizard state: material → heat up (wait) → [insert] → load/unload/M600 → [purge] → done.
 * A module singleton, so a running step survives leaving the screen. The end of a move sequence is
 * the `PositionUpdate` event answering the trailing `M400` + `M114`.
 */
import {
  actionGcode,
  canExtrude,
  wizardSteps,
  type FilamentAction,
  type WizardStep,
} from '../../lib/core/filament';
import type { TemperaturePreset } from '../../lib/core/settings';
import { t } from '../../lib/i18n/index.svelte';
import { capabilities, events, settings, temperatures, terminal } from '../../lib/stores';
import { toast } from '../../lib/ui/toast.svelte';
import { confirmHigh } from '../heaterTarget';

export type RunKind = FilamentAction | 'purge';

export interface RunState {
  kind: RunKind;
  /** Nominal duration of the moves; `null` when the firmware drives it (M701/M702/M600). */
  seconds: number | null;
  id: number;
}

/** Extra time allowed beyond the nominal duration before moving on anyway. */
const SLACK_MS = 30_000;
const FIRMWARE_TIMEOUT_MS = 5 * 60_000;

class FilamentWizard {
  action = $state<FilamentAction>('load');
  step = $state<WizardStep>('material');
  preset = $state.raw<TemperaturePreset | null>(null);
  run = $state.raw<RunState | null>(null);
  /** "Use the defaults" was chosen for an unconfigured extruder in this session. */
  defaultsAccepted = $state(false);

  steps = $derived(wizardSteps(this.action));
  temperature = $derived(this.preset?.hotend ?? 0);
  /** M701/M702 are used instead of the G-code sequences. */
  firmware = $derived(capabilities.has('filamentLoadUnload'));

  private runId = 0;
  private stopWaiting: (() => void) | null = null;

  async start(preset: TemperaturePreset): Promise<void> {
    if (!(await confirmHigh('tool0', preset.hotend))) return;
    try {
      if (temperatures.latest.tool0?.target !== preset.hotend) await temperatures.setTarget('tool0', preset.hotend);
    } catch {
      toast.show(t('temps.setFailed'), { tone: 'error' });
      return;
    }
    this.preset = preset;
    this.step = 'heat';
  }

  /** Called by the screen once the hot end is at temperature. */
  heated(): void {
    if (this.step !== 'heat') return;
    if (this.action === 'load') this.step = 'insert';
    else void this.execute(this.action);
  }

  async execute(kind: RunKind): Promise<void> {
    const minTemp = settings.value.filament.minTemp;
    if (!canExtrude(temperatures.latest.tool0?.actual, minTemp)) {
      toast.show(t('filament.tooCold', { value: minTemp }), { tone: 'warning' });
      this.step = 'heat';
      return;
    }
    const { commands, seconds } = actionGcode(kind, settings.value.filament, kind !== 'purge' && this.firmware);
    const id = ++this.runId;
    this.run = { kind, seconds, id };
    this.step = 'run';
    const finished = this.waitForEnd(kind === 'change' ? null : seconds === null ? FIRMWARE_TIMEOUT_MS : seconds * 1000 + SLACK_MS);
    try {
      await terminal.send(commands);
    } catch {
      this.stopWaiting?.();
      toast.show(t('filament.failed'), { tone: 'error' });
      this.run = null;
      this.step = kind === 'purge' ? 'purge' : this.action === 'load' ? 'insert' : 'material';
      return;
    }
    await finished;
    if (this.runId !== id) return; // cancelled meanwhile
    this.run = null;
    this.step = kind === 'load' || kind === 'purge' ? 'purge' : 'done';
  }

  /** The user says the firmware-driven step (M600) is over. */
  finishRun(): void {
    this.stopWaiting?.();
  }

  cancel(): void {
    if (this.run) {
      // Quick stop of the running moves (immediate only with Marlin's emergency parser).
      void terminal.send('M410').catch(() => undefined);
    }
    this.reset();
  }

  reset(): void {
    this.runId++;
    this.stopWaiting?.();
    this.stopWaiting = null;
    this.run = null;
    this.step = 'material';
  }

  private waitForEnd(timeoutMs: number | null): Promise<void> {
    this.stopWaiting?.();
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const done = () => {
        off();
        if (timer) clearTimeout(timer);
        if (this.stopWaiting === done) this.stopWaiting = null;
        resolve();
      };
      const off = events.on('PositionUpdate', done);
      if (timeoutMs !== null) timer = setTimeout(done, timeoutMs);
      this.stopWaiting = done;
    });
  }
}

export const wizard = new FilamentWizard();
