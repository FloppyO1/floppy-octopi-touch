/** Screen registry of the shell: sidebar order, icons, and which screens need a connected printer. */
import FolderOpen from '@lucide/svelte/icons/folder-open';
import Grid3x3 from '@lucide/svelte/icons/grid-3x3';
import House from '@lucide/svelte/icons/house';
import Move from '@lucide/svelte/icons/move';
import Settings from '@lucide/svelte/icons/settings';
import Spool from '@lucide/svelte/icons/spool';
import SquareTerminal from '@lucide/svelte/icons/square-terminal';
import Thermometer from '@lucide/svelte/icons/thermometer';
import type { Component } from 'svelte';
import type { ScreenId } from '../lib/stores/nav.svelte';
import type { IconComponent } from '../lib/ui/types';
import Filament from '../screens/Filament.svelte';
import Files from '../screens/Files.svelte';
import Home from '../screens/Home.svelte';
import Leveling from '../screens/Leveling.svelte';
import MoveScreen from '../screens/Move.svelte';
import System from '../screens/System.svelte';
import Temperature from '../screens/Temperature.svelte';
import Terminal from '../screens/Terminal.svelte';

export interface ScreenDef {
  id: ScreenId;
  icon: IconComponent;
  component: Component;
  /** Shows the "printer disconnected" overlay when the printer is not operational. */
  needsPrinter: boolean;
}

export const SCREENS: readonly ScreenDef[] = [
  { id: 'home', icon: House, component: Home, needsPrinter: true },
  { id: 'files', icon: FolderOpen, component: Files, needsPrinter: false },
  { id: 'temperature', icon: Thermometer, component: Temperature, needsPrinter: true },
  { id: 'move', icon: Move, component: MoveScreen, needsPrinter: true },
  { id: 'filament', icon: Spool, component: Filament, needsPrinter: true },
  { id: 'terminal', icon: SquareTerminal, component: Terminal, needsPrinter: false },
  { id: 'leveling', icon: Grid3x3, component: Leveling, needsPrinter: true },
  { id: 'system', icon: Settings, component: System, needsPrinter: false },
];
