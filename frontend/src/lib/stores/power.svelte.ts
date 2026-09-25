/**
 * PSU Control plugin (kantlivelong/OctoPrint-PSUControl): state from its socket message
 * `{isPSUOn}` (sent on every change and when a client connects), switched with its SimpleApi
 * commands `turnPSUOn` / `turnPSUOff`.
 */
import { plugin } from '../api/octoprint';
import { parsePsuState } from '../core/power';
import { PLUGIN_IDS } from '../core/printerState';
import { server } from './server.svelte';

const PSU = PLUGIN_IDS.psuControl;

class PowerStore {
  available = $derived(server.plugins.psuControl);
  /** `null` while unknown. */
  psuOn = $derived(parsePsuState(server.pluginMessages[PSU]));
  busy = $state(false);

  /** `GET /api/plugin/psucontrol` answers `{isPSUOn}` like `getPSUState`. */
  async load(): Promise<void> {
    if (!this.available) return;
    try {
      server.setPluginMessage(PSU, await plugin.get(PSU));
    } catch {
      /* the next socket message brings the state anyway */
    }
  }

  async set(on: boolean): Promise<void> {
    this.busy = true;
    try {
      await plugin.command(PSU, on ? 'turnPSUOn' : 'turnPSUOff');
      await this.load();
    } finally {
      this.busy = false;
    }
  }
}

export const power = new PowerStore();
