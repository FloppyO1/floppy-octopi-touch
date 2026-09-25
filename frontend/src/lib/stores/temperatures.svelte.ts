/** Live temperatures and their history (circular buffer, ~30 min at OctoPrint's sample rate). */
import { printer as printerApi } from '../api/octoprint';
import type { HeaterReading, TemperatureSample } from '../api/types';
import { TemperatureHistory } from '../core/tempHistory';
import { sameJson } from './util';

class TemperatureStore {
  readonly history = new TemperatureHistory(2048);
  latest = $state.raw<Record<string, HeaterReading>>({});
  /** Heaters with readings, in OctoPrint's order (tool0, bed, …). */
  heaters = $state.raw<string[]>([]);
  /** Bumped on every new sample: read it to re-render charts built from `history`. */
  revision = $state(0);

  /** Replaces the buffer (socket `history` message after (re)connecting). */
  reset(samples: TemperatureSample[] | undefined): void {
    this.history.clear();
    this.history.push(samples);
    this.sync();
  }

  add(samples: TemperatureSample[] | undefined): void {
    if (this.history.push(samples)) this.sync();
  }

  /** Sets the target of `heater` (`tool0`…, `bed`, `chamber`); 0 turns it off. */
  setTarget(heater: string, target: number): Promise<void> {
    if (heater === 'bed') return printerApi.setBedTarget(target);
    if (heater === 'chamber') return printerApi.setChamberTarget(target);
    return printerApi.setToolTargets({ [heater]: target });
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
