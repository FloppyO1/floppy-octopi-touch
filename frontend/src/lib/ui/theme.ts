/** Accent colour (tokens in tokens.css): teal by default, amber and indigo selectable in the settings. */
import { ACCENTS, type Accent } from '../core/settings';

export { ACCENTS, type Accent };

export const DEFAULT_ACCENT: Accent = 'teal';

export function isAccent(value: unknown): value is Accent {
  return typeof value === 'string' && (ACCENTS as readonly string[]).includes(value);
}

/** `?accent=amber|teal|indigo` previews an accent and wins over the saved setting. */
export function previewAccent(search = typeof location === 'undefined' ? '' : location.search): Accent | null {
  const value = new URLSearchParams(search).get('accent');
  return isAccent(value) ? value : null;
}

export function applyAccent(accent: Accent): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.accent = previewAccent() ?? accent;
}
