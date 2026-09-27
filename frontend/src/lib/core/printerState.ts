import type { OctoPrintSettings, PrinterState } from '../api/types';
import type { GaugeTone } from './gauge';

/** One word for the printer state, derived from OctoPrint's flags (the text is localised by OctoPrint). */
export type PrinterPhase =
  | 'unknown'
  | 'disconnected'
  | 'connecting'
  | 'error'
  | 'operational'
  | 'printing'
  | 'pausing'
  | 'paused'
  | 'resuming'
  | 'cancelling'
  | 'finishing';

export function printerPhase(state: PrinterState | null | undefined): PrinterPhase {
  if (!state?.flags) return 'unknown';
  const f = state.flags;
  if (f.error) return 'error';
  if (f.cancelling) return 'cancelling';
  if (f.pausing) return 'pausing';
  if (f.resuming) return 'resuming';
  if (f.paused) return 'paused';
  if (f.finishing) return 'finishing';
  if (f.printing) return 'printing';
  if (f.operational) return 'operational';
  if (f.closedOrError) return 'disconnected';
  // Opening the port, detecting the baud rate, waiting for the firmware…
  return 'connecting';
}

/** Phases in which a job exists and manual control should be limited. */
export const JOB_PHASES: readonly PrinterPhase[] = [
  'printing',
  'pausing',
  'paused',
  'resuming',
  'cancelling',
  'finishing',
];

/** Plugins the dashboard integrates with, by OctoPrint plugin identifier. */
export const PLUGIN_IDS = {
  psuControl: 'psucontrol',
  slicerThumbnails: 'prusaslicerthumbnails',
  displayLayerProgress: 'DisplayLayerProgress',
  actionCommandPrompt: 'action_command_prompt',
  actionCommandNotification: 'action_command_notification',
  cancelObjects: 'cancelobject',
} as const;

export type PluginKey = keyof typeof PLUGIN_IDS;

/**
 * Installed and enabled plugins, from the `plugins` section of `/api/settings` (it lists every
 * enabled plugin that has settings, which all of these have; no admin rights needed).
 */
export function detectPlugins(settings: OctoPrintSettings | null): Record<PluginKey, boolean> {
  const present = new Set(Object.keys(settings?.plugins ?? {}));
  return Object.fromEntries(
    Object.entries(PLUGIN_IDS).map(([key, id]) => [key, present.has(id)]),
  ) as Record<PluginKey, boolean>;
}

/** Colour of a printer phase (status bar, overlays, Home). */
export function phaseTone(phase: PrinterPhase): GaugeTone {
  switch (phase) {
    case 'printing':
    case 'finishing':
      return 'accent';
    case 'pausing':
    case 'paused':
    case 'resuming':
    case 'cancelling':
      return 'paused';
    case 'error':
      return 'error';
    case 'operational':
      return 'ok';
    default:
      return 'neutral';
  }
}
