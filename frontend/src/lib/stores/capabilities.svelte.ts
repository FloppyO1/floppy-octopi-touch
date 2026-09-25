/** Firmware capabilities: parsed from the M115 report in the terminal log + manual overrides. */
import { printer as printerApi } from '../api/octoprint';
import {
  parseM115Lines,
  resolveCapabilities,
  type CapabilityKey,
  type FirmwareReport,
} from '../core/capabilities';
import { settings } from './settings.svelte';

class CapabilityStore {
  // Raw + replaced on change: keys added to a deep $state proxy are not seen by `in` checks
  // of an already computed $derived.
  report = $state.raw<FirmwareReport>({ firmwareName: null, caps: {} });
  /** M115 already asked for on this connection. */
  private requested = false;

  resolved = $derived(resolveCapabilities(this.report.caps, settings.value.capabilities.overrides));
  /**
   * A whole report was seen. `Cap:` lines without the `FIRMWARE_NAME` line that starts the report
   * are the tail of one cut by the `history` window after a reload: ask for M115 again.
   */
  known = $derived(Object.keys(this.report.caps).length > 0 && this.report.firmwareName !== null);

  has(key: CapabilityKey): boolean {
    return this.resolved[key].enabled;
  }

  ingest(lines: readonly string[] | undefined): void {
    if (!lines?.some((l) => l.includes('Cap:') || l.includes('FIRMWARE_NAME:'))) return;
    const next = { firmwareName: this.report.firmwareName, caps: { ...this.report.caps } };
    if (parseM115Lines(lines, next)) this.report = next;
  }

  setFirmwareName(name: string | null): void {
    if (name !== this.report.firmwareName) this.report = { ...this.report, firmwareName: name };
  }

  /** Printer disconnected: the next connection may be a different firmware. */
  reset(): void {
    this.report = { firmwareName: null, caps: {} };
    this.requested = false;
  }

  /** Printer connected: OctoPrint sends M115 by itself during the handshake, do not ask twice. */
  expectReport(): void {
    this.requested = true;
  }

  /** Sends M115 once per connection if the report is not known yet (e.g. UI started after connect). */
  async requestIfUnknown(): Promise<void> {
    if (this.known || this.requested) return;
    this.requested = true;
    try {
      await printerApi.command('M115');
    } catch {
      this.requested = false;
    }
  }
}

export const capabilities = new CapabilityStore();
