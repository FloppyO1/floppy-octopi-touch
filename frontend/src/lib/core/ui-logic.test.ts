import { describe, expect, it } from 'vitest';
import { arcGeometry, arcPoint, gaugeFraction, heaterTone } from './gauge';
import { editText, keyboardRows, keyChar, rowUnits, type KeyboardLayer } from './keyboard';
import { applyNumpadKey, initialEntry, parseEntry, type NumpadKey } from './numpad';
import { fitFor } from '../ui/fit';

describe('gauge', () => {
  it('clamps the fraction and handles missing values', () => {
    expect(gaugeFraction(50, 0, 100)).toBe(0.5);
    expect(gaugeFraction(-5, 0, 100)).toBe(0);
    expect(gaugeFraction(300, 0, 275)).toBe(1);
    expect(gaugeFraction(null, 0, 100)).toBe(0);
    expect(gaugeFraction(10, 5, 5)).toBe(0);
  });

  it('computes a 270° arc starting at the bottom-left end of the gap', () => {
    const g = arcGeometry(100, 10);
    expect(g.radius).toBe(45);
    expect(g.track).toBeCloseTo(g.circumference * 0.75);
    expect(g.rotation).toBe(135);
    // Middle of the sweep is straight up.
    const top = arcPoint(100, g.radius, 0.5);
    expect(top.x).toBeCloseTo(50);
    expect(top.y).toBeCloseTo(5);
  });

  it('colours heaters by distance from the target', () => {
    expect(heaterTone(null, 200)).toBe('neutral');
    expect(heaterTone(25, 0)).toBe('neutral');
    expect(heaterTone(150, 200)).toBe('heating');
    expect(heaterTone(198.5, 200)).toBe('ok');
    expect(heaterTone(230, 200)).toBe('cooling');
  });
});

describe('numpad', () => {
  const type = (keys: NumpadKey[], start = initialEntry(null), options = {}) =>
    keys.reduce((entry, key) => applyNumpadKey(entry, key, options), start);

  it('replaces the initial value on the first digit and keeps it on backspace', () => {
    expect(type(['2', '1', '5'], initialEntry(200)).text).toBe('215');
    expect(type(['back'], initialEntry(200)).text).toBe('20');
  });

  it('avoids leading zeros and limits decimals', () => {
    expect(type(['0', '0', '7']).text).toBe('7');
    expect(type(['.', '5', '5'], initialEntry(null), { decimals: 1 }).text).toBe('0.5');
    expect(type(['1', '.', '2'], initialEntry(null), { decimals: 0 }).text).toBe('12');
    expect(type(['1', '.', '.', '2'], initialEntry(null), { decimals: 2 }).text).toBe('1.2');
  });

  it('allows the sign only when the minimum is negative', () => {
    expect(type(['5', '-']).text).toBe('5');
    expect(type(['5', '-'], initialEntry(null), { min: -10, decimals: 2 }).text).toBe('-5');
  });

  it('respects the maximum length', () => {
    expect(type(['1', '2', '3', '4'], initialEntry(null), { maxLength: 3 }).text).toBe('123');
  });

  it('validates against min and max', () => {
    expect(parseEntry('', { max: 275 }).error).toEqual({ kind: 'empty' });
    expect(parseEntry('280', { max: 275 }).error).toEqual({ kind: 'max', limit: 275 });
    expect(parseEntry('-1', { min: 0 }).error).toEqual({ kind: 'min', limit: 0 });
    expect(parseEntry('0.5', { min: 0, max: 1 })).toEqual({ value: 0.5, error: null });
  });

  it('formats the initial value without trailing zeros', () => {
    expect(initialEntry(0.5, 2).text).toBe('0.5');
    expect(initialEntry(200, 1).text).toBe('200');
  });
});

describe('keyboard', () => {
  const layers: KeyboardLayer[] = ['letters', 'symbols', 'gcode'];

  it('has rows of equal width in every layer', () => {
    for (const locale of ['en', 'it'] as const) {
      for (const layer of layers) {
        const units = keyboardRows(layer, locale).map(rowUnits);
        expect(new Set(units).size, `${layer}/${locale}: ${units}`).toBe(1);
      }
    }
  });

  it('has the Italian accented letters', () => {
    const chars = keyboardRows('letters', 'it')
      .flat()
      .flatMap((k) => (k.kind === 'char' ? [keyChar(k, false), keyChar(k, true)] : []));
    for (const c of ['à', 'è', 'é', 'ì', 'ò', 'ù']) expect(chars).toContain(c);
  });

  it('edits text with the caret at the end', () => {
    expect(editText('G2', { char: '8' })).toBe('G28');
    expect(editText('G28', { key: 'backspace' })).toBe('G2');
    expect(editText('G28', { key: 'space' })).toBe('G28 ');
    expect(editText('G28', { key: 'enter' })).toBe('G28');
    expect(editText('G28', { key: 'enter' }, { multiline: true })).toBe('G28\n');
    expect(editText('abc', { char: 'd' }, { maxLength: 3 })).toBe('abc');
  });
});

describe('fit to other screen sizes', () => {
  it('leaves 1024x600 alone and scales other windows, centred', () => {
    expect(fitFor(1024, 600)).toBeNull();
    expect(fitFor(1920, 1080)).toEqual({ scale: 1.8, left: 38, top: 0 });
    expect(fitFor(800, 480)).toEqual({ scale: 0.7813, left: 0, top: 6 });
    expect(fitFor(0, 0)).toBeNull();
  });
});
