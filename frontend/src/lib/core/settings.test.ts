import { describe, expect, it } from 'vitest';
import { defaultSettings, migrateSettings, newId, SETTINGS_VERSION } from './settings';

describe('migrateSettings', () => {
  it('returns the defaults for empty or invalid documents', () => {
    for (const raw of [undefined, null, 'x', 42, []]) {
      const { settings, changed } = migrateSettings(raw);
      expect(settings).toEqual(defaultSettings());
      expect(changed).toBe(true);
    }
  });

  it('upgrades the v1 document written by the agent, keeping user values', () => {
    const { settings, changed } = migrateSettings({ schemaVersion: 1, language: 'it', clock24h: false });
    expect(changed).toBe(true);
    expect(settings.schemaVersion).toBe(SETTINGS_VERSION);
    expect(settings.language).toBe('it');
    expect(settings.clock24h).toBe(false);
    expect(settings.presets.map((p) => p.name)).toEqual(['PLA', 'PETG', 'TPU']);
    expect(settings.temperature).toEqual({
      confirmAbove: { hotend: 250, bed: 90 },
      max: { hotend: 275, bed: 110 },
    });
    expect(settings.screenOff).toEqual({ enabled: false, timeoutMin: 30 });
    expect(settings.filament.bowdenLength).toBe(0);
    expect(settings.filament.loadSlowLength).toBe(100);
    expect(settings.printDone.beep).toBe(true);
    expect(settings.capabilities.overrides.promptSupport).toBe('auto');
  });

  it('treats a document without version as v1', () => {
    expect(migrateSettings({ language: 'it' }).settings.language).toBe('it');
  });

  it('leaves a current document untouched', () => {
    const current = defaultSettings();
    current.presets.push({ id: 'abs', name: 'ABS', hotend: 245, bed: 100, fan: 0 });
    const { settings, changed } = migrateSettings(JSON.parse(JSON.stringify(current)));
    expect(changed).toBe(false);
    expect(settings).toEqual(current);
  });

  it('repairs wrong types, unknown enums and malformed list items', () => {
    const { settings } = migrateSettings({
      schemaVersion: 2,
      language: 'fr',
      accent: 'pink',
      screensaver: { enabled: 'yes', timeoutMin: 10 },
      temperature: { max: { hotend: '300' } },
      presets: [{ id: 'x', name: 'X', hotend: 190, bed: 50, fan: null }, { name: 'broken' }, null],
      macros: 'nope',
      capabilities: { overrides: { eeprom: 'maybe', autolevel: 'on' } },
    });
    expect(settings.language).toBe('en');
    expect(settings.accent).toBe('teal');
    expect(settings.screensaver).toEqual({ enabled: true, timeoutMin: 10, showThumbnail: false });
    expect(settings.temperature.max).toEqual({ hotend: 275, bed: 110 });
    expect(settings.presets).toEqual([{ id: 'x', name: 'X', hotend: 190, bed: 50, fan: null }]);
    expect(settings.macros).toEqual(defaultSettings().macros);
    expect(settings.capabilities.overrides.eeprom).toBe('auto');
    expect(settings.capabilities.overrides.autolevel).toBe('on');
  });

  it('migrates v2 documents up to v4 with the webcam, Home preview and file browser defaults', () => {
    const { settings, changed } = migrateSettings({ schemaVersion: 2, language: 'it', home: { preview: 'map' } });
    expect(changed).toBe(true);
    expect(settings.schemaVersion).toBe(4);
    expect(settings.language).toBe('it');
    expect(settings.webcam).toEqual({ url: '' });
    expect(settings.home).toEqual({ preview: 'thumbnail' });
    expect(settings.files).toEqual({ sort: 'date', direction: 'desc', view: 'grid' });
  });

  it('migrates v3 documents to v4: screensaver thumbnail off, file browser prefs validated', () => {
    const { settings, changed } = migrateSettings({
      schemaVersion: 3,
      screensaver: { enabled: false, timeoutMin: 2 },
      files: { sort: 'colour', direction: 'up', view: 'list' },
    });
    expect(changed).toBe(true);
    expect(settings.schemaVersion).toBe(4);
    expect(settings.screensaver).toEqual({ enabled: false, timeoutMin: 2, showThumbnail: false });
    expect(settings.files).toEqual({ sort: 'date', direction: 'desc', view: 'list' });
  });

  it('keeps documents from a newer release without downgrading them', () => {
    const { settings } = migrateSettings({ schemaVersion: 99, language: 'it', futureField: 1 });
    expect(settings.schemaVersion).toBe(99);
    expect((settings as unknown as Record<string, unknown>).futureField).toBe(1);
  });

  it('does not share state between calls', () => {
    const a = migrateSettings({}).settings;
    a.presets.pop();
    expect(migrateSettings({}).settings.presets).toHaveLength(3);
  });
});

describe('newId', () => {
  it('creates distinct prefixed ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newId('macro')));
    expect(ids.size).toBe(50);
    expect([...ids][0]).toMatch(/^macro-/);
  });
});
