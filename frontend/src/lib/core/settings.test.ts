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
      chartMinutes: 15,
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

  it('migrates v2 documents up to the current version with the webcam, Home preview and file browser defaults', () => {
    const { settings, changed } = migrateSettings({ schemaVersion: 2, language: 'it', home: { preview: 'map' } });
    expect(changed).toBe(true);
    expect(settings.schemaVersion).toBe(SETTINGS_VERSION);
    expect(settings.language).toBe('it');
    expect(settings.webcam).toEqual({ url: '' });
    expect(settings.home).toEqual({ preview: 'thumbnail' });
    expect(settings.files).toEqual({ sort: 'date', direction: 'desc', view: 'grid' });
  });

  it('migrates v3 documents: screensaver thumbnail off, file browser prefs validated', () => {
    const { settings, changed } = migrateSettings({
      schemaVersion: 3,
      screensaver: { enabled: false, timeoutMin: 2 },
      files: { sort: 'colour', direction: 'up', view: 'list' },
    });
    expect(changed).toBe(true);
    expect(settings.schemaVersion).toBe(SETTINGS_VERSION);
    expect(settings.screensaver).toEqual({ enabled: false, timeoutMin: 2, showThumbnail: false });
    expect(settings.files).toEqual({ sort: 'date', direction: 'desc', view: 'list' });
  });

  it('migrates v4 documents to v5: chart window, jog settings and cold extrusion limit', () => {
    const { settings, changed } = migrateSettings({
      schemaVersion: 4,
      temperature: { confirmAbove: { hotend: 240, bed: 85 }, chartMinutes: 7 },
      move: { step: 3, xyFeedrate: 4000 },
      filament: { extruderType: 'hybrid', bowdenLength: 420 },
    });
    expect(changed).toBe(true);
    expect(settings.schemaVersion).toBe(SETTINGS_VERSION);
    expect(settings.temperature.confirmAbove).toEqual({ hotend: 240, bed: 85 });
    expect(settings.temperature.chartMinutes).toBe(15);
    expect(settings.move).toEqual({ step: 10, xyFeedrate: 4000, zFeedrate: 300 });
    expect(settings.filament.extruderType).toBe('unknown');
    expect(settings.filament.bowdenLength).toBe(420);
    expect(settings.filament.minTemp).toBe(170);
  });

  it('migrates v5 documents to v6: terminal filters, leveling, macro look repaired', () => {
    const { settings, changed } = migrateSettings({
      schemaVersion: 5,
      terminal: { filters: { ok: true } },
      leveling: { inset: 25, babystep: 0.3 },
      macros: [
        { id: 'a', name: 'Lights', icon: 'lamp', color: 'pink', gcode: 'M355 S1' },
        { id: 'b', name: 'Broken' },
      ],
    });
    expect(changed).toBe(true);
    expect(settings.schemaVersion).toBe(SETTINGS_VERSION);
    expect(settings.terminal.filters).toEqual({ temperature: true, ok: true, busy: true, sd: true, position: false });
    expect(settings.leveling).toEqual({ inset: 25, zHop: 5, babystep: 0.05, meshStep: 0.05 });
    expect(settings.macros).toEqual([
      { id: 'a', name: 'Lights', icon: 'play', color: 'neutral', gcode: 'M355 S1', confirm: false },
    ]);
  });

  it('migrates v6 documents to v7: no custom actions, PSU off the status bar, broken actions repaired', () => {
    expect(migrateSettings({ schemaVersion: 6 }).settings).toMatchObject({
      schemaVersion: 7,
      customActions: [],
      psu: { statusBar: false },
    });
    const { settings } = migrateSettings({
      schemaVersion: 7,
      customActions: [
        { id: 'l', name: 'Lights', kind: 'plugin', icon: 'rocket', plugin: { id: 'gpio', command: 'on' } },
        { name: 'no id' },
        'junk',
      ],
    });
    expect(settings.customActions).toEqual([
      {
        id: 'l',
        name: 'Lights',
        icon: 'light',
        color: 'warn',
        kind: 'plugin',
        gcode: '',
        system: { source: '', action: '' },
        plugin: { id: 'gpio', command: 'on', data: '' },
        confirm: false,
        statusBar: false,
      },
    ]);
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
