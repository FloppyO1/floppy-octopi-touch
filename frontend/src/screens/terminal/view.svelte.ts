/** State of the Terminal screen, kept across navigation (tab, command being typed, pause). */

export type TerminalTab = 'console' | 'macros';

class TerminalView {
  tab = $state<TerminalTab>('console');
  /** Command being typed. */
  draft = $state('');
  keyboard = $state(false);
  /** Id of the last line shown when the log was paused, `null` = live. */
  pausedAt = $state<number | null>(null);
}

export const view = new TerminalView();
