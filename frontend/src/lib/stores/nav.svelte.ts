/** Current screen of the shell, mirrored in the URL hash (`#/files`) so a reload keeps it. */

export const SCREEN_IDS = [
  'home',
  'files',
  'temperature',
  'move',
  'filament',
  'terminal',
  'leveling',
  'system',
] as const;

export type ScreenId = (typeof SCREEN_IDS)[number];

export function screenFromHash(hash: string): ScreenId {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return (SCREEN_IDS as readonly string[]).includes(id) ? (id as ScreenId) : 'home';
}

class NavStore {
  current = $state<ScreenId>(
    typeof location === 'undefined' ? 'home' : screenFromHash(location.hash),
  );

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('hashchange', () => (this.current = screenFromHash(location.hash)));
    }
  }

  go(id: ScreenId): void {
    this.current = id;
    if (typeof history !== 'undefined') history.replaceState(null, '', `${location.pathname}${location.search}#/${id}`);
  }
}

export const nav = new NavStore();
