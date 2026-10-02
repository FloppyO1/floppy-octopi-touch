/** Live temperatures and their history (circular buffer, ~30 min at OctoPrint's sample rate). */
import { printer as printerApi } from '../api/octoprint';
import type { HeaterReading, TemperatureSample } from '../api/types';
import { applyHeatupLines, createHeatupState, heatupOverrideCommands, type HeatupState } from '../core/heatup';
import { TemperatureHistory } from '../core/tempHistory';
import { sameJson } from './util';

/**
 * How new targets reached the printer: `direct` (nothing was waiting), `interrupted` (a heat-up
 * wait was ended with M108 and waits again for the new value), `afterWait` (no EMERGENCY_PARSER:
 * the firmware reads them when the current wait is over).
 */
export type TargetDelivery = 'direct' | 'interrupted' | 'afterWait';

class TemperatureStore {
  readonly history = new TemperatureHistory(2048);
  latest = $state.raw<Record<string, HeaterReading>>({});
  /** Heaters with readings, in OctoPrint's order (tool0, bed, …). */
  heaters = $state.raw<string[]>([]);
  /** Bumped on every new sample: read it to re-render charts built from `history`. */
  revision = $state(0);
  /** Blocking M109/M190/M191 in progress, from the terminal log. */
  heatup = $state.raw<HeatupState>(createHeatupState());

  /** Replaces the buffer (socket `history` message after (re)connecting). */
  reset(samples: TemperatureSample[] | undefined): void {
    this.history.clear();
    this.history.push(samples);
    this.sync();
  }

  add(samples: TemperatureSample[] | undefined): void {
    if (this.history.push(samples)) this.sync();
  }

  ingestLog(lines: readonly string[] | undefined): void {
    if (!lines?.length) return;
    const next = { ...this.heatup };
    if (applyHeatupLines(next, lines)) this.heatup = next;
  }

  /** Printer disconnected: no wait survives it. */
  resetHeatup(): void {
    this.heatup = createHeatupState();
  }

  /** Sets the target of `heater` (`tool0`…, `bed`, `chamber`); 0 turns it off. */
  setTarget(heater: string, target: number): Promise<void> {
    if (heater === 'bed') return printerApi.setBedTarget(target);
    if (heater === 'chamber') return printerApi.setChamberTarget(target);
    return printerApi.setToolTargets({ [heater]: target });
  }

  /**
   * Sets several targets; during a heat-up wait and with `emergencyParser` (M108 jumps OctoPrint's
   * queue and Marlin's), the wait is ended and restarted so that they apply at once.
   */
  async setTargets(targets: Record<string, number>, emergencyParser: boolean): Promise<TargetDelivery> {
    const wait = this.heatup.wait;
    if (wait && emergencyParser) {
      const temps = Object.fromEntries(Object.entries(this.latest).map(([h, r]) => [h, r.actual]));
      await printerApi.command(heatupOverrideCommands(wait, targets, temps));
      return 'interrupted';
    }
    await Promise.all(Object.entries(targets).map(([heater, value]) => this.setTarget(heater, value)));
    return wait ? 'afterWait' : 'direct';
  }

  async allOff(): Promise<void> {
    await Promise.all(this.heaters.map((h) => this.setTarget(h, 0)));
  }

  private sync(): void {
    const latest = this.history.latest();
    const heaters = this.history.heaters();
    const withReadings = Object.fromEntries(heaters.map((h) => [h, latest[h]]));
    if (!sameJson(withReadings, this.latest)) this.latest = withReadings;
    if (!sameJson(heaters, this.heaters)) this.heaters = heaters;
    this.revision++;
  }
}

export const temperatures = new TemperatureStore();
