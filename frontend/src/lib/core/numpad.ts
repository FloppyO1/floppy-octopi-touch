/** Entry logic of the on-screen NumPad (pure). */

export type NumpadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '.' | '-' | 'back' | 'clear';

export interface NumpadOptions {
  min?: number;
  max?: number;
  /** Digits after the decimal point; 0 disables the '.' key. */
  decimals?: number;
  /** Max characters, including sign and point. */
  maxLength?: number;
}

export interface NumpadEntry {
  text: string;
  /** The initial value is shown but the first digit replaces it (like a calculator). */
  fresh: boolean;
}

export function initialEntry(value: number | null | undefined, decimals = 0): NumpadEntry {
  const text = value == null || !Number.isFinite(value) ? '' : formatNumber(value, decimals);
  return { text, fresh: true };
}

function formatNumber(value: number, decimals: number): string {
  // Drop trailing zeros: 0.50 → "0.5", 200.0 → "200".
  return String(Number(value.toFixed(decimals)));
}

export function applyNumpadKey(entry: NumpadEntry, key: NumpadKey, options: NumpadOptions = {}): NumpadEntry {
  const { decimals = 0, maxLength = 8 } = options;
  const allowNegative = (options.min ?? 0) < 0;
  let text = entry.fresh && key !== 'back' ? '' : entry.text;

  switch (key) {
    case 'clear':
      return { text: '', fresh: false };
    case 'back':
      return { text: entry.text.slice(0, -1), fresh: false };
    case '-':
      if (!allowNegative) return entry;
      text = text.startsWith('-') ? text.slice(1) : `-${text}`;
      return { text, fresh: false };
    case '.':
      if (decimals === 0) return entry;
      if (text.includes('.')) return { text, fresh: false };
      text = `${text === '' || text === '-' ? `${text}0` : text}.`;
      break;
    default: {
      const [, fraction] = text.split('.');
      if (fraction !== undefined && fraction.length >= decimals) return { text, fresh: false };
      // No leading zeros: "0" + "5" → "5".
      if (text === '0') text = '';
      else if (text === '-0') text = '-';
      text += key;
    }
  }
  if (text.length > maxLength) return { ...entry, fresh: false };
  return { text, fresh: false };
}

export type NumpadError = { kind: 'empty' } | { kind: 'min'; limit: number } | { kind: 'max'; limit: number };

/** Parses the entry: `{ value }` when valid, `{ error }` otherwise. */
export function parseEntry(
  text: string,
  options: NumpadOptions = {},
): { value: number; error: null } | { value: null; error: NumpadError } {
  if (text === '' || text === '-' || text === '.' || text === '-.') {
    return { value: null, error: { kind: 'empty' } };
  }
  const value = Number(text);
  if (!Number.isFinite(value)) return { value: null, error: { kind: 'empty' } };
  if (options.max !== undefined && value > options.max) {
    return { value: null, error: { kind: 'max', limit: options.max } };
  }
  if (options.min !== undefined && value < options.min) {
    return { value: null, error: { kind: 'min', limit: options.min } };
  }
  return { value, error: null };
}
