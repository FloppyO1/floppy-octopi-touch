/** OctoPrint configuration the UI depends on: settings subset, printer profile, plugins. */
import { getSettings, printerProfiles } from '../api/octoprint';
import type { OctoPrintSettings, PrinterProfile } from '../api/types';
import { detectPlugins } from '../core/printerState';

class ServerStore {
  settings = $state.raw<OctoPrintSettings | null>(null);
  profile = $state.raw<PrinterProfile | null>(null);
  /** Last `plugin` socket message per plugin identifier (DisplayLayerProgress, PSU Control…). */
  pluginMessages = $state.raw<Record<string, unknown>>({});

  plugins = $derived(detectPlugins(this.settings));
  sdSupport = $derived(this.settings?.feature?.sdSupport !== false);

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

  setPluginMessage(plugin: string, data: unknown): void {
    this.pluginMessages = { ...this.pluginMessages, [plugin]: data };
  }
}

export const server = new ServerStore();
