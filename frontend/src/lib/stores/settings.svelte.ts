/** Dashboard settings synchronised with the agent (`/local/settings`). */
import { getAgentSettings, putAgentSettings } from '../api/agent';
import { defaultSettings, migrateSettings, type Accent, type Language, type Settings } from '../core/settings';
import { setLocale } from '../i18n/index.svelte';
import { applyAccent } from '../ui/theme';

export type SyncStatus = 'loading' | 'ready' | 'saving' | 'error';

const SAVE_DELAY_MS = 400;

class SettingsStore {
  value = $state<Settings>(defaultSettings());
  status = $state<SyncStatus>('loading');
  error = $state<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  async load(): Promise<void> {
    this.status = 'loading';
    try {
      const { settings, changed } = migrateSettings(await getAgentSettings());
      this.value = settings;
      setLocale(settings.language);
      applyAccent(settings.accent);
      this.status = 'ready';
      this.error = null;
      if (changed) await this.flush();
    } catch (error) {
      // Keep working with the defaults: a missing agent must not block the UI.
      this.status = 'error';
      this.error = String(error);
    }
  }

  /** Mutates the settings and schedules a (debounced) save. */
  update(mutate: (settings: Settings) => void): void {
    mutate(this.value);
    this.scheduleSave();
  }

  setLanguage(language: Language): void {
    setLocale(language);
    this.update((s) => (s.language = language));
  }

  setAccent(accent: Accent): void {
    applyAccent(accent);
    this.update((s) => (s.accent = accent));
  }

  /** Back to a fresh install (presets, macros and actions included), saved at once. */
  async reset(): Promise<void> {
    this.value = defaultSettings();
    setLocale(this.value.language);
    applyAccent(this.value.accent);
    await this.flush();
  }

  /** Writes pending changes now. */
  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.status = 'saving';
    try {
      await putAgentSettings($state.snapshot(this.value));
      this.status = 'ready';
      this.error = null;
    } catch (error) {
      this.status = 'error';
      this.error = String(error);
    }
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }
}

export const settings = new SettingsStore();
