import { describe, expect, it } from 'vitest';
import type { PrinterStateFlags } from '../api/types';
import { detectPlugins, printerPhase } from './printerState';

const flags = (on: Partial<PrinterStateFlags>): PrinterStateFlags => ({
  operational: false,
  printing: false,
  cancelling: false,
  pausing: false,
  resuming: false,
  finishing: false,
  closedOrError: false,
  error: false,
  paused: false,
  ready: false,
  sdReady: false,
  ...on,
});

describe('printerPhase', () => {
  it('maps OctoPrint flags to a phase', () => {
    expect(printerPhase(null)).toBe('unknown');
    expect(printerPhase({ text: 'Offline', flags: flags({ closedOrError: true }) })).toBe('disconnected');
    expect(printerPhase({ text: 'Error', flags: flags({ closedOrError: true, error: true }) })).toBe('error');
    expect(printerPhase({ text: 'Connecting', flags: flags({}) })).toBe('connecting');
    expect(printerPhase({ text: 'Operational', flags: flags({ operational: true, ready: true }) })).toBe(
      'operational',
    );
    expect(printerPhase({ text: 'Printing', flags: flags({ operational: true, printing: true }) })).toBe(
      'printing',
    );
    expect(
      printerPhase({ text: 'Pausing', flags: flags({ operational: true, printing: true, pausing: true }) }),
    ).toBe('pausing');
    expect(printerPhase({ text: 'Paused', flags: flags({ operational: true, paused: true }) })).toBe('paused');
    expect(
      printerPhase({ text: 'Cancelling', flags: flags({ operational: true, printing: true, cancelling: true }) }),
    ).toBe('cancelling');
  });
});

describe('detectPlugins', () => {
  it('reads plugin identifiers from the settings', () => {
    const plugins = detectPlugins({
      plugins: { action_command_prompt: {}, psucontrol: {}, DisplayLayerProgress: {} },
    });
    expect(plugins).toEqual({
      psuControl: true,
      slicerThumbnails: false,
      displayLayerProgress: true,
      actionCommandPrompt: true,
      actionCommandNotification: false,
      cancelObjects: false,
    });
    expect(Object.values(detectPlugins(null)).some(Boolean)).toBe(false);
  });
});
