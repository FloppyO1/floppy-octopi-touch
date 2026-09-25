/** Tab of the Leveling screen, kept across navigation. */

export type LevelingTab = 'paper' | 'mesh' | 'z';

class LevelingView {
  tab = $state<LevelingTab>('paper');
}

export const view = new LevelingView();
