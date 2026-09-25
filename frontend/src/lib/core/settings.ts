/**
 * Dashboard settings: schema, defaults and migrations.
 *
 * The agent stores the document as-is (`/local/settings`); the frontend owns its shape. On load the
 * document is migrated step by step up to `SETTINGS_VERSION`, then merged over the defaults so that
 * fields added later always exist and fields with a wrong type are reset.
 */
import { defaultCapabilityOverrides, type CapabilityOverrides } from './capabilities';

export const SETTINGS_VERSION = 3;

export type Language = 'en' | 'it';
export const LANGUAGES: readonly Language[] = ['en', 'it'];

/** Accent colour variants (tokens in ui/tokens.css). */
export const ACCENTS = ['teal', 'amber', 'indigo'] as const;
export type Accent = (typeof ACCENTS)[number];

export interface TemperaturePreset {
  id: string;
  name: string;
  hotend: number;
  bed: number;
  /** Part cooling fan in percent, `null` = leave unchanged. */
  fan: number | null;
}

export interface Macro {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** One G-code command per line. */
  gcode: string;
  confirm: boolean;
}

export type ExtruderType = 'unknown' | 'direct' | 'bowden';

/** What the Home screen shows next to the job: the file's thumbnail or the webcam. */
export const HOME_PREVIEWS = ['thumbnail', 'webcam'] as const;
export type HomePreview = (typeof HOME_PREVIEWS)[number];

export interface Settings {
  schemaVersion: number;
  language: Language;
  clock24h: boolean;
  accent: Accent;
  screensaver: { enabled: boolean; timeoutMin: number };
  /** HDMI output off when idle (never while printing). */
  screenOff: { enabled: boolean; timeoutMin: number };
  temperature: {
    /** Ask for confirmation above these targets (°C). */
    confirmAbove: { hotend: number; bed: number };
    /** Highest target accepted by the NumPad (°C); lower printer profile limits win. */
    max: { hotend: number; bed: number };
  };
  presets: TemperaturePreset[];
  macros: Macro[];
  printDone: { beep: boolean; beepGcode: string };
  /** Feed rates in mm/min, lengths in mm. */
  filament: {
    extruderType: ExtruderType;
    /** Set once the user has reviewed these values (the wizard asks otherwise). */
    configured: boolean;
    bowdenLength: number;
    fastFeedrate: number;
    loadSlowLength: number;
    slowFeedrate: number;
    unloadLength: number;
    purgeLength: number;
  };
  capabilities: { overrides: CapabilityOverrides };
  /** Manual stream URL; empty = the webcam configured in OctoPrint. */
  webcam: { url: string };
  home: { preview: HomePreview };
}

export function defaultSettings(): Settings {
  return {
    schemaVersion: SETTINGS_VERSION,
    language: 'en',
    clock24h: true,
    accent: 'teal',
    screensaver: { enabled: true, timeoutMin: 5 },
    screenOff: { enabled: false, timeoutMin: 30 },
    temperature: {
      confirmAbove: { hotend: 250, bed: 90 },
      max: { hotend: 275, bed: 110 },
    },
    presets: [
      { id: 'pla', name: 'PLA', hotend: 200, bed: 60, fan: null },
      { id: 'petg', name: 'PETG', hotend: 235, bed: 80, fan: null },
      { id: 'tpu', name: 'TPU', hotend: 225, bed: 50, fan: null },
    ],
    macros: [
      { id: 'home', name: 'Home all', icon: 'home', color: 'accent', gcode: 'G28', confirm: false },
      {
        id: 'park',
        name: 'Park head',
        icon: 'park',
        color: 'accent',
        gcode: 'G91\nG1 Z10 F600\nG90\nG1 X0 Y200 F6000',
        confirm: false,
      },
      { id: 'motors-off', name: 'Motors off', icon: 'motor', color: 'warn', gcode: 'M84', confirm: true },
      { id: 'report', name: 'Report settings', icon: 'info', color: 'neutral', gcode: 'M503', confirm: false },
    ],
    printDone: { beep: true, beepGcode: 'M300 S880 P400' },
    filament: {
      extruderType: 'unknown',
      configured: false,
      bowdenLength: 0,
      fastFeedrate: 1500,
      loadSlowLength: 100,
      slowFeedrate: 150,
      unloadLength: 100,
      purgeLength: 20,
    },
    capabilities: { overrides: defaultCapabilityOverrides() },
    webcam: { url: '' },
    home: { preview: 'thumbnail' },
  };
}

type Doc = Record<string, unknown>;

/**
 * `MIGRATIONS[n]` upgrades a version-n document to version n+1. Only structural changes need code:
 * new fields come from the defaults merge.
 */
const MIGRATIONS: Record<number, (doc: Doc) => Doc> = {
  // v1 (agent defaults, session 1): only language and clock24h.
  1: (doc) => doc,
  // v3 (session 4): `webcam` and `home` added, both from the defaults.
  2: (doc) => doc,
};

const isObject = (v: unknown): v is Doc => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep merge: `value` wins where it has the same JSON type as the default. Arrays are taken whole. */
function mergeOver<T>(defaults: T, value: unknown): T {
  if (isObject(defaults)) {
    if (!isObject(value)) return defaults;
    const out: Doc = { ...value };
    for (const [key, def] of Object.entries(defaults)) out[key] = mergeOver(def, value[key]);
    return out as T;
  }
  if (Array.isArray(defaults)) return (Array.isArray(value) ? value : defaults) as T;
  if (defaults === null) return (value === undefined ? null : value) as T;
  return (typeof value === typeof defaults ? value : defaults) as T;
}

export interface MigrationResult {
  settings: Settings;
  /** True if the stored document must be rewritten (migrated or repaired). */
  changed: boolean;
}

export function migrateSettings(raw: unknown): MigrationResult {
  let doc: Doc = isObject(raw) ? structuredClone(raw) : {};
  const original = JSON.stringify(doc);
  let version = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 1;

  while (version < SETTINGS_VERSION) {
    doc = (MIGRATIONS[version] ?? ((d: Doc) => d))(doc);
    version++;
  }
  // A document from a newer release is kept (unknown fields survive), just not downgraded.
  doc.schemaVersion = Math.max(version, SETTINGS_VERSION);

  const settings = mergeOver(defaultSettings(), doc);
  if (!LANGUAGES.includes(settings.language)) settings.language = 'en';
  if (!ACCENTS.includes(settings.accent)) settings.accent = 'teal';
  if (!HOME_PREVIEWS.includes(settings.home.preview)) settings.home.preview = 'thumbnail';
  // Array items are user data: drop malformed ones instead of failing later in the UI.
  settings.presets = settings.presets.filter(
    (p) => isObject(p) && typeof p.id === 'string' && typeof p.name === 'string' &&
      typeof p.hotend === 'number' && typeof p.bed === 'number',
  );
  settings.macros = settings.macros.filter(
    (m) => isObject(m) && typeof m.id === 'string' && typeof m.name === 'string' &&
      typeof m.gcode === 'string',
  );
  const overrides = settings.capabilities.overrides as Record<string, string>;
  for (const [key, value] of Object.entries(overrides)) {
    if (!['auto', 'on', 'off'].includes(value)) overrides[key] = 'auto';
  }

  return { settings, changed: JSON.stringify(settings) !== original };
}

/** Short unique id for user-created presets and macros (works outside secure contexts too). */
export function newId(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
