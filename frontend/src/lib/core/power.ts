/**
 * Power and lights (pure): PSU Control state and the user's custom actions.
 *
 * A custom action is a button that sends G-code, runs an OctoPrint system command or calls a
 * plugin's SimpleApi command (`POST /api/plugin/<id>` with `{command, ...data}`), optionally also
 * shown in the status bar.
 */
import { nameTaken } from './lists';
import { MACRO_COLORS, MACRO_ICONS, macroCommands } from './macros';

export const ACTION_KINDS = ['gcode', 'system', 'plugin'] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export interface CustomAction {
  id: string;
  name: string;
  /** Same icon and colour names as the macros. */
  icon: string;
  color: string;
  kind: ActionKind;
  /** `gcode`: one command per line. */
  gcode: string;
  /** `system`: an OctoPrint system command. */
  system: { source: string; action: string };
  /** `plugin`: identifier, command and extra fields as a JSON object. */
  plugin: { id: string; command: string; data: string };
  confirm: boolean;
  statusBar: boolean;
}

export const ACTION_NAME_MAX = 24;
/** Status bar room: the phase, temperatures, network and clock come first. */
export const STATUS_BAR_MAX_ACTIONS = 3;

export function newAction(id: string): CustomAction {
  return {
    id,
    name: '',
    icon: 'light',
    color: 'warn',
    kind: 'gcode',
    gcode: '',
    system: { source: '', action: '' },
    plugin: { id: '', command: '', data: '' },
    confirm: false,
    statusBar: false,
  };
}

/** `data` of a plugin action: '' = no extra fields, otherwise a JSON object; `null` if invalid. */
export function parsePluginData(text: string): Record<string, unknown> | null {
  if (!text.trim()) return {};
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

const IDENTIFIER_RE = /^[A-Za-z0-9_.-]+$/;

export type ActionError =
  | 'name'
  | 'duplicate'
  | 'gcode'
  | 'system'
  | 'pluginId'
  | 'pluginCommand'
  | 'pluginData'
  | 'statusBarFull';

/** First problem of an action being edited, `null` when it can be saved. */
export function validateAction(action: CustomAction, list: readonly CustomAction[]): ActionError | null {
  const name = action.name.trim();
  if (!name || name.length > ACTION_NAME_MAX) return 'name';
  if (nameTaken(list, action.id, name)) return 'duplicate';
  if (action.kind === 'gcode' && !macroCommands(action.gcode).length) return 'gcode';
  if (action.kind === 'system' && (!action.system.source || !action.system.action)) return 'system';
  if (action.kind === 'plugin') {
    if (!IDENTIFIER_RE.test(action.plugin.id.trim())) return 'pluginId';
    if (!IDENTIFIER_RE.test(action.plugin.command.trim())) return 'pluginCommand';
    if (parsePluginData(action.plugin.data) === null) return 'pluginData';
  }
  if (action.statusBar) {
    const others = list.filter((a) => a.statusBar && a.id !== action.id).length;
    if (others >= STATUS_BAR_MAX_ACTIONS) return 'statusBarFull';
  }
  return null;
}

/** Drops malformed stored actions and fills missing fields (settings migration). */
export function sanitizeActions(value: unknown): CustomAction[] {
  if (!Array.isArray(value)) return [];
  const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
  const text = (v: unknown) => (typeof v === 'string' ? v : '');
  return value
    .filter((a) => isObject(a) && typeof a.id === 'string' && typeof a.name === 'string')
    .map((a) => {
      const base = newAction(a.id as string);
      const system = isObject(a.system) ? a.system : {};
      const plugin = isObject(a.plugin) ? a.plugin : {};
      return {
        ...base,
        name: a.name as string,
        icon: (MACRO_ICONS as readonly string[]).includes(text(a.icon)) ? text(a.icon) : base.icon,
        color: (MACRO_COLORS as readonly string[]).includes(text(a.color)) ? text(a.color) : base.color,
        kind: (ACTION_KINDS as readonly unknown[]).includes(a.kind) ? (a.kind as ActionKind) : 'gcode',
        gcode: text(a.gcode),
        system: { source: text(system.source), action: text(system.action) },
        plugin: { id: text(plugin.id), command: text(plugin.command), data: text(plugin.data) },
        confirm: a.confirm === true,
        statusBar: a.statusBar === true,
      };
    });
}

/** `isPSUOn` from PSU Control's socket message or its `getPSUState` answer. */
export function parsePsuState(data: unknown): boolean | null {
  if (typeof data !== 'object' || data === null) return null;
  const value = (data as Record<string, unknown>).isPSUOn;
  return typeof value === 'boolean' ? value : null;
}
