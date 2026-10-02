/**
 * Filament wizard state: material → heat up (wait) → [unload] → [insert] → [load] → [purge] → done
 * (a change does both). A module singleton, so a running step survives leaving the screen. The end
 * of a move sequence is the echo of the marker sent after `M400` (`fot:marker` event).
 */
import {
  actionGcode,
  canExtrude,
  MIN_DURATION_SHARE,
  progressStep,
  stepAfterRun,
  wizardSteps,
  type FilamentAction,
  type RunKind,
  type WizardStep,
} from '../../lib/core/filament';
import type { TemperaturePreset } from '../../lib/core/settings';
import { t } from '../../lib/i18n/index.svelte';
import { capabilities, events, settings, temperatures, terminal } from '../../lib/stores';
import { toast } from '../../lib/ui/toast.svelte';
import { confirmHigh } from '../heaterTarget';

export interface RunState {
  kind: RunKind;
  /** Nominal duration of the moves; `null` when the firmware drives it (M701/M702). */
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
  current = $derived(progressStep(this.step, this.run?.kind ?? null));
  temperature = $derived(this.preset?.hotend ?? 0);
  /** M701/M702 are used instead of the G-code sequences. */
  firmware = $derived(capabilities.has('filamentLoadUnload'));

  private runId = 0;
  private stopWaiting: (() => void) | null = null;
  /** Makes the end markers of this page unique (an old echo in the log never matches). */
  private readonly session = String(Date.now() % 1e7);

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
    else void this.execute('unload');
  }

  async execute(kind: RunKind): Promise<void> {
    const minTemp = settings.value.filament.minTemp;
    if (!canExtrude(temperatures.latest.tool0?.actual, minTemp)) {
      toast.show(t('filament.tooCold', { value: minTemp }), { tone: 'warning' });
      this.step = 'heat';
      return;
    }
    const id = ++this.runId;
    const token = `${this.session}${id}`;
    const { commands, seconds } = actionGcode(kind, settings.value.filament, kind !== 'purge' && this.firmware, token);
    this.run = { kind, seconds, id };
    this.step = 'run';
    const finished =
      seconds === null
        ? this.waitForEnd(token, FIRMWARE_TIMEOUT_MS, 0)
        : this.waitForEnd(token, seconds * 1000 + SLACK_MS, seconds * 1000 * MIN_DURATION_SHARE);
    try {
      await terminal.send(commands);
    } catch {
      this.stopWaiting?.();
      toast.show(t('filament.failed'), { tone: 'error' });
      this.run = null;
      this.step = kind === 'purge' ? 'purge' : kind === 'load' ? 'insert' : 'material';
      return;
    }
    await finished;
    if (this.runId !== id) return; // cancelled meanwhile
    this.run = null;
    const next = stepAfterRun(this.action, kind);
    if (next === 'done') void this.finish();
    else this.step = next;
  }

  /** Last step; with "cool down at the end" the hot end is turned off. */
  async finish(): Promise<void> {
    this.step = 'done';
    if (!settings.value.filament.coolDownAtEnd) return;
    try {
      await temperatures.setTarget('tool0', 0);
      toast.show(t('filament.cooledDown'), { tone: 'ok' });
    } catch {
      toast.show(t('temps.setFailed'), { tone: 'error' });
    }
  }

  /** Cancel at any step: stops the moves and the heating (the wizard is locked during jobs). */
  async cancel(): Promise<void> {
    if (this.run) {
      // Quick stop of the running moves (immediate only with Marlin's emergency parser).
      void terminal.send('M410').catch(() => undefined);
    }
    this.reset();
    try {
      await temperatures.setTarget('tool0', 0);
      toast.show(t('filament.cancelled'));
    } catch {
      toast.show(t('temps.setFailed'), { tone: 'error' });
    }
  }

  reset(): void {
    this.runId++;
    this.stopWaiting?.();
    this.stopWaiting = null;
    this.run = null;
    this.step = 'material';
  }

  /** Resolves on the echo of `token` (not before `minMs`), or after `timeoutMs` anyway. */
  private waitForEnd(token: string, timeoutMs: number, minMs: number): Promise<void> {
    this.stopWaiting?.();
    const startedAt = performance.now();
    return new Promise((resolve) => {
      const timers = new Set<ReturnType<typeof setTimeout>>();
      const done = () => {
        off();
        for (const timer of timers) clearTimeout(timer);
        if (this.stopWaiting === done) this.stopWaiting = null;
        resolve();
      };
      const off = events.on('fot:marker', (event) => {
        if (event.payload?.token !== token) return;
        const early = minMs - (performance.now() - startedAt);
        if (early > 0) timers.add(setTimeout(done, early));
        else done();
      });
      timers.add(setTimeout(done, timeoutMs));
      this.stopWaiting = done;
    });
  }
}

export const wizard = new FilamentWizard();
