/** Minimal runtime i18n (en/it). The full store with persistence arrives with the data layer. */
import en from './en.json';
import it from './it.json';

export const messages = { en, it } as const;
export type Locale = keyof typeof messages;
export type MessageKey = keyof typeof en;

export const i18n = $state<{ locale: Locale }>({ locale: 'en' });

export function format(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

/** Translates `key`, falling back to English and then to the key itself. */
export function t(key: MessageKey | string, params?: Record<string, string | number>): string {
  const table: Record<string, string> = messages[i18n.locale];
  const fallback: Record<string, string> = messages.en;
  return format(table[key] ?? fallback[key] ?? key, params);
}
