/**
 * G-code macros: icon and colour choices, validation and the commands a macro sends (pure).
 * Icons are names mapped to Lucide components by the Terminal screen; colours map to theme tokens.
 */
import { nameTaken } from './lists';
import type { Macro } from './settings';

export const MACRO_ICONS = [
  'play',
  'home',
  'park',
  'motor',
  'info',
  'fan',
  'heat',
  'cool',
  'light',
  'level',
  'tool',
  'bell',
] as const;
export type MacroIcon = (typeof MACRO_ICONS)[number];

export const MACRO_COLORS = ['accent', 'neutral', 'ok', 'cool', 'warn', 'danger'] as const;
export type MacroColor = (typeof MACRO_COLORS)[number];

export const MACRO_NAME_MAX = 24;
/** A macro is a short sequence, not a print file. */
export const MACRO_MAX_COMMANDS = 50;

/** Commands of a macro: one per line, `;` comments and blank lines dropped. */
export function macroCommands(gcode: string): string[] {
  return gcode
    .split(/\r?\n/)
    .map((line) => line.replace(/;.*$/, '').trim().replace(/\s+/g, ' '))
    .filter((line) => line.length > 0);
}

export type MacroError = 'name' | 'duplicate' | 'empty' | 'long';

/** First problem of a macro being edited, `null` when it can be saved. */
export function validateMacro(macro: Macro, list: readonly Macro[]): MacroError | null {
  const name = macro.name.trim();
  if (!name || name.length > MACRO_NAME_MAX) return 'name';
  if (nameTaken(list, macro.id, name)) return 'duplicate';
  const commands = macroCommands(macro.gcode);
  if (!commands.length) return 'empty';
  if (commands.length > MACRO_MAX_COMMANDS) return 'long';
  return null;
}
