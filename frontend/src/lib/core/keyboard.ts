/**
 * On-screen keyboard layouts and text editing (pure). Rows are laid out with flex weights
 * (`width`, default 1 unit); every row of a layer adds up to the same number of units.
 */

export type SpecialKey = 'shift' | 'backspace' | 'enter' | 'space' | 'symbols' | 'letters' | 'gcode' | 'lang';

export type KeyDef =
  | { kind: 'char'; char: string; shifted?: string; width?: number }
  | { kind: 'special'; key: SpecialKey; width?: number };

export type KeyRow = KeyDef[];
export type KeyboardLocale = 'en' | 'it';
export type KeyboardLayer = 'letters' | 'symbols' | 'gcode';

const chars = (list: string): KeyDef[] =>
  [...list].map((char) => ({ kind: 'char', char, shifted: char.toUpperCase() }));
const sym = (list: string): KeyDef[] => [...list].map((char) => ({ kind: 'char', char }));
const special = (key: SpecialKey, width = 1.5): KeyDef => ({ kind: 'special', key, width });
const wide = (char: string, width: number, shifted?: string): KeyDef => ({ kind: 'char', char, shifted, width });

const NUMBERS: KeyRow = [...sym('1234567890'), special('backspace')];
const BOTTOM: KeyRow = [
  special('symbols'),
  special('lang'),
  ...sym(','),
  special('space', 5),
  ...sym('.'),
  special('gcode'),
];

const LETTERS: Record<KeyboardLocale, KeyRow[]> = {
  en: [
    NUMBERS,
    [...chars('qwertyuiop'), wide('-', 1.5, '_')],
    [...chars('asdfghjkl'), { kind: 'char', char: "'", shifted: '"' }, special('enter')],
    [special('shift'), ...chars('zxcvbnm'), ...sym('!?/')],
    BOTTOM,
  ],
  it: [
    NUMBERS,
    [...chars('qwertyuiop'), wide('è', 1.5, 'é')],
    [...chars('asdfghjkl'), { kind: 'char', char: 'ò', shifted: 'ç' }, special('enter')],
    [special('shift'), ...chars('zxcvbnm'), ...chars('àùì')],
    BOTTOM,
  ],
};

const SYMBOLS: KeyRow[] = [
  NUMBERS,
  [...sym('!@#$%&*()='), wide('+', 1.5)],
  [...sym('-_/\\:;"\'?~'), special('enter')],
  [...sym('[]{}<>|^`°'), wide('€', 1.5)],
  [special('letters'), special('lang'), ...sym(','), special('space', 5), ...sym('.'), special('gcode')],
];

/** G-code: the letters Marlin commands use plus a numeric block; always upper case. */
const GCODE: KeyRow[] = [
  [...sym('GMTSFP'), ...sym('789'), special('backspace')],
  [...sym('XYZEIJ'), ...sym('456'), wide('-', 1.5)],
  [...sym('RHLDB;'), ...sym('123'), special('enter')],
  [special('letters'), special('space', 5.5), wide('0', 2), wide('.', 1.5)],
];

export function keyboardRows(layer: KeyboardLayer, locale: KeyboardLocale): KeyRow[] {
  if (layer === 'gcode') return GCODE;
  if (layer === 'symbols') return SYMBOLS;
  return LETTERS[locale] ?? LETTERS.en;
}

export const keyWidth = (key: KeyDef): number => key.width ?? 1;
export const rowUnits = (row: KeyRow): number => row.reduce((sum, key) => sum + keyWidth(key), 0);

/** Character typed by a char key with the current shift state. */
export function keyChar(key: KeyDef & { kind: 'char' }, shift: boolean): string {
  return shift && key.shifted ? key.shifted : key.char;
}

export interface TextEditOptions {
  multiline?: boolean;
  maxLength?: number;
}

/** Applies a typed string or an editing key to `text` (the caret is always at the end). */
export function editText(
  text: string,
  input: { char: string } | { key: 'backspace' | 'enter' | 'space' },
  options: TextEditOptions = {},
): string {
  let next: string;
  if ('char' in input) next = text + input.char;
  else if (input.key === 'backspace') next = [...text].slice(0, -1).join('');
  else if (input.key === 'space') next = `${text} `;
  else next = options.multiline ? `${text}\n` : text;
  if (options.maxLength !== undefined && [...next].length > options.maxLength) return text;
  return next;
}
