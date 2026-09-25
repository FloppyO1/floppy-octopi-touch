/** Accent colour variants (tokens in tokens.css). */
export const ACCENTS = ['amber', 'teal', 'indigo'] as const;
export type Accent = (typeof ACCENTS)[number];

export const DEFAULT_ACCENT: Accent = 'teal';

export function isAccent(value: unknown): value is Accent {
  return typeof value === 'string' && (ACCENTS as readonly string[]).includes(value);
}

export function applyAccent(accent: Accent): void {
  document.documentElement.dataset.accent = accent;
}
