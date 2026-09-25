/** OctoPrint configuration the UI depends on: settings subset, printer profile, plugins, webcam. */
import { getJson } from '../api/http';
import { getSettings, printerProfiles } from '../api/octoprint';
import type { OctoPrintSettings, PrinterProfile } from '../api/types';
import { DLP_SOCKET_PLUGIN, DLP_VALUES_URL } from '../core/layer';
import { detectPlugins } from '../core/printerState';
import { resolveWebcam } from '../core/webcam';
import { settings as dashboardSettings } from './settings.svelte';

class ServerStore {
  settings = $state.raw<OctoPrintSettings | null>(null);
  profile = $state.raw<PrinterProfile | null>(null);
  /** Last `plugin` socket message per plugin identifier (DisplayLayerProgress, PSU Control…). */
  pluginMessages = $state.raw<Record<string, unknown>>({});

  plugins = $derived(detectPlugins(this.settings));
  sdSupport = $derived(this.settings?.feature?.sdSupport !== false);
  /** Stream to show on the Home screen, `null` without a webcam. */
  webcam = $derived(resolveWebcam(this.settings, dashboardSettings.value.webcam.url));

  async loadSettings(): Promise<void> {
    try {
      this.settings = await getSettings();
    } catch {
      /* retried on the next reconnection or SettingsUpdated event */
    }
  }

  async loadProfile(): Promise<void> {
    try {
      const { profiles } = await printerProfiles.list();
      const all = Object.values(profiles);
      this.profile = all.find((p) => p.current) ?? all.find((p) => p.default) ?? null;
    } catch {
      /* idem */
    }
  }

  /**
   * DisplayLayerProgress only pushes layer changes: after a (re)connection its REST values fill the
   * gap. They are kept under the socket message key (`parseLayerInfo` reads both shapes).
   */
  async loadLayerValues(): Promise<void> {
    if (!this.plugins.displayLayerProgress) return;
    try {
      const values = await getJson<unknown>(DLP_VALUES_URL);
      if (!(DLP_SOCKET_PLUGIN in this.pluginMessages)) this.setPluginMessage(DLP_SOCKET_PLUGIN, values);
    } catch {
      /* the next socket message brings the data anyway */
    }
  }

  setPluginMessage(plugin: string, data: unknown): void {
    this.pluginMessages = { ...this.pluginMessages, [plugin]: data };
  }
}

export const server = new ServerStore();
