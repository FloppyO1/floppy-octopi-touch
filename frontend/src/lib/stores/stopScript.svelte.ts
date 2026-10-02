/**
 * OctoPrint's script after Stop (`afterPrintCancelled`): whether it turns motors, heaters and the
 * part fan off (core/stopScript), and the fix that appends the missing lines. The script comes with
 * `GET /api/settings` (reloaded on every SettingsUpdated event), the extruders from the profile.
 */
import { saveGcodeScript } from '../api/octoprint';
import { analyseStopScript, CANCEL_SCRIPT, fixStopScript, type StopScriptStatus } from '../core/stopScript';
import { server } from './server.svelte';

class StopScriptStore {
  /** `null` while unknown (settings or profile not loaded, or a key without SETTINGS_READ). */
  status = $derived.by<StopScriptStatus | null>(() => {
    const scripts = server.settings?.scripts?.gcode;
    const profile = server.profile;
    if (!scripts || !profile) return null;
    return analyseStopScript(scripts, {
      extruders: profile.extruder?.count ?? 1,
      sharedNozzle: profile.extruder?.sharedNozzle === true,
      heatedBed: profile.heatedBed !== false,
    });
  });
  /** The script as OctoPrint stores it (a Jinja template). */
  script = $derived(server.settings?.scripts?.gcode?.[CANCEL_SCRIPT] ?? '');
  busy = $state(false);

  /** Appends the missing lines; throws the HttpError (403 = the key may not change settings). */
  async fix(): Promise<void> {
    const missing = this.status?.missing ?? [];
    if (!missing.length) return;
    this.busy = true;
    try {
      await saveGcodeScript(CANCEL_SCRIPT, fixStopScript(this.script, missing));
      await server.loadSettings();
    } finally {
      this.busy = false;
    }
  }
}

export const stopScript = new StopScriptStore();
