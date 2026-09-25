/** Feed rate (M220), flow (M221) and part cooling fan (M106/M107), tracked from the terminal log. */
import { printer as printerApi } from '../api/octoprint';
import { applyTuneLines, createTuneState, fanValue, type TuneState } from '../core/tune';

class TuneStore {
  state = $state.raw<TuneState>(createTuneState());

  feedrate = $derived(this.state.feedrate);
  flow = $derived(this.state.flow);
  fan = $derived(this.state.fan);

  ingest(lines: readonly string[] | undefined): void {
    if (!lines?.length) return;
    const next = { ...this.state };
    if (applyTuneLines(next, lines)) this.state = next;
  }

  /** Printer (re)connected: the firmware may have restarted with its defaults. */
  reset(): void {
    this.state = createTuneState();
  }

  // The values are set optimistically; the `Send:` lines in the log confirm them a moment later.
  async setFeedrate(percent: number): Promise<void> {
    await printerApi.feedrate(percent);
    this.state = { ...this.state, feedrate: Math.round(percent) };
  }

  async setFlow(percent: number): Promise<void> {
    await printerApi.flowrate(percent);
    this.state = { ...this.state, flow: Math.round(percent) };
  }

  async setFan(percent: number): Promise<void> {
    const value = fanValue(percent);
    await printerApi.command(value > 0 ? `M106 S${value}` : 'M107');
    this.state = { ...this.state, fan: Math.round(percent) };
  }
}

export const tune = new TuneStore();
