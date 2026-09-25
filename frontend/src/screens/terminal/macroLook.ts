/** Icon and colour of a macro button: names stored in the settings → Lucide icons and theme tokens. */
import Bell from '@lucide/svelte/icons/bell';
import Fan from '@lucide/svelte/icons/fan';
import Flame from '@lucide/svelte/icons/flame';
import Grid3x3 from '@lucide/svelte/icons/grid-3x3';
import House from '@lucide/svelte/icons/house';
import Info from '@lucide/svelte/icons/info';
import Lightbulb from '@lucide/svelte/icons/lightbulb';
import Play from '@lucide/svelte/icons/play';
import PowerOff from '@lucide/svelte/icons/power-off';
import Snowflake from '@lucide/svelte/icons/snowflake';
import SquareParking from '@lucide/svelte/icons/square-parking';
import Wrench from '@lucide/svelte/icons/wrench';
import type { MacroColor, MacroIcon } from '../../lib/core/macros';
import type { IconComponent } from '../../lib/ui/types';

export const MACRO_ICON_COMPONENTS: Record<MacroIcon, IconComponent> = {
  play: Play,
  home: House,
  park: SquareParking,
  motor: PowerOff,
  info: Info,
  fan: Fan,
  heat: Flame,
  cool: Snowflake,
  light: Lightbulb,
  level: Grid3x3,
  tool: Wrench,
  bell: Bell,
};

const COLOR_VARS: Record<MacroColor, string> = {
  accent: 'var(--accent)',
  neutral: 'var(--idle)',
  ok: 'var(--ok)',
  cool: 'var(--cooling)',
  warn: 'var(--paused)',
  danger: 'var(--error)',
};

export const macroIcon = (name: string): IconComponent => MACRO_ICON_COMPONENTS[name as MacroIcon] ?? Play;
export const macroColor = (name: string): string => COLOR_VARS[name as MacroColor] ?? COLOR_VARS.neutral;
