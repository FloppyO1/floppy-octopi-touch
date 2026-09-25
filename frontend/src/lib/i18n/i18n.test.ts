import { describe, expect, it } from 'vitest';
import en from './en.json';
import itMessages from './it.json';
import { format, i18n, t } from './index.svelte';

describe('i18n', () => {
  it('has the same keys in every language', () => {
    expect(Object.keys(itMessages).sort()).toEqual(Object.keys(en).sort());
  });

  it('defaults to English and switches at runtime', () => {
    expect(i18n.locale).toBe('en');
    expect(t('heater.bed')).toBe('Bed');
    i18n.locale = 'it';
    expect(t('heater.bed')).toBe('Piatto');
    i18n.locale = 'en';
  });

  it('falls back to the key and interpolates parameters', () => {
    expect(t('does.not.exist')).toBe('does.not.exist');
    expect(format('Updated {time} {missing}', { time: '12:00' })).toBe('Updated 12:00 {missing}');
  });
});
