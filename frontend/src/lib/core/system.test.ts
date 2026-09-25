import { describe, expect, it } from 'vitest';
import type { NetworkInfo, SystemCommands } from '../api/types';
import { newAction, parsePluginData, parsePsuState, validateAction, type CustomAction } from './power';
import { cpuTempTone, networkSummary, plainText, signalBars, systemActions, uptimeParts, usageTone } from './system';

describe('host metrics', () => {
  it('colours usage and CPU temperature', () => {
    expect([usageTone(null), usageTone(30), usageTone(80), usageTone(95)]).toEqual(['neutral', 'accent', 'paused', 'error']);
    expect([cpuTempTone(undefined), cpuTempTone(48), cpuTempTone(72), cpuTempTone(82)]).toEqual([
      'neutral',
      'ok',
      'paused',
      'error',
    ]);
  });

  it('splits the uptime', () => {
    expect(uptimeParts(93784)).toEqual({ days: 1, hours: 2, minutes: 3 });
    expect(uptimeParts(59)).toEqual({ days: 0, hours: 0, minutes: 0 });
    expect(uptimeParts(null)).toBeNull();
  });

  it('turns the signal into bars', () => {
    expect([null, 0, 10, 30, 60, 90].map(signalBars)).toEqual([null, 0, 1, 2, 3, 4]);
  });
});

describe('networkSummary', () => {
  const base: NetworkInfo = {
    primary: 'wlan0',
    gateway: '192.168.1.1',
    interfaces: [
      { name: 'eth0', state: 'down', mac: null, ipv4: null, wireless: false },
      { name: 'wlan0', state: 'up', mac: null, ipv4: '192.168.1.42', wireless: true },
    ],
    wifi: { interface: 'wlan0', connected: true, ssid: 'Casa', signal: 82 },
  };

  it('describes the interface of the default route', () => {
    expect(networkSummary(base)).toEqual({ kind: 'wifi', interface: 'wlan0', ip: '192.168.1.42', ssid: 'Casa', signal: 82 });
    const wired: NetworkInfo = {
      ...base,
      primary: 'eth0',
      interfaces: [{ name: 'eth0', state: 'up', mac: null, ipv4: '10.0.0.5', wireless: false }, base.interfaces[1]],
    };
    expect(networkSummary(wired)).toMatchObject({ kind: 'ethernet', ip: '10.0.0.5', ssid: null, signal: null });
  });

  it('reports no network without an address', () => {
    expect(networkSummary(null).kind).toBe('none');
    expect(networkSummary({ ...base, primary: null }).kind).toBe('none');
  });
});

describe('systemActions', () => {
  const commands: SystemCommands = {
    core: [
      { action: 'shutdown', name: 'Shutdown system', source: 'core', confirm: '<strong>Sure?</strong></p><p>Really &amp; truly.' },
      { action: 'reboot', name: 'Reboot system', source: 'core' },
      { action: 'restart', name: 'Restart OctoPrint', source: 'core' },
    ],
    custom: [
      { action: 'lights', name: 'Lights', source: 'custom' },
      { action: 'divider', name: '', source: 'custom' },
    ],
    plugin: [],
  };

  it('orders the core commands and keeps the custom ones', () => {
    expect(systemActions(commands).map((c) => `${c.kind}:${c.action}`)).toEqual([
      'restart:restart',
      'reboot:reboot',
      'shutdown:shutdown',
      'other:lights',
    ]);
    expect(systemActions(null)).toEqual([]);
  });

  it('turns OctoPrint confirmation HTML into text', () => {
    expect(plainText(commands.core[0].confirm!)).toBe('Sure?\n\nReally & truly.');
  });
});

describe('custom actions', () => {
  const action = (patch: Partial<CustomAction>): CustomAction => ({ ...newAction('a'), name: 'Lights', ...patch });

  it('validates each kind', () => {
    expect(validateAction(action({ gcode: 'M355 S1' }), [])).toBeNull();
    expect(validateAction(action({ name: ' ' }), [])).toBe('name');
    expect(validateAction(action({ gcode: '; nothing' }), [])).toBe('gcode');
    expect(validateAction(action({ gcode: 'M355', id: 'b' }), [action({ gcode: 'M355' })])).toBe('duplicate');
    expect(validateAction(action({ kind: 'system' }), [])).toBe('system');
    expect(validateAction(action({ kind: 'system', system: { source: 'custom', action: 'lights' } }), [])).toBeNull();
    const plugin = (id: string, command: string, data = '') => action({ kind: 'plugin', plugin: { id, command, data } });
    expect(validateAction(plugin('psucontrol', 'togglePSU'), [])).toBeNull();
    expect(validateAction(plugin('bad id', 'x'), [])).toBe('pluginId');
    expect(validateAction(plugin('gpio', ''), [])).toBe('pluginCommand');
    expect(validateAction(plugin('gpio', 'on', '[1]'), [])).toBe('pluginData');
  });

  it('limits the status bar buttons', () => {
    const others = ['x', 'y', 'z'].map((id) => action({ id, name: id, gcode: 'M1', statusBar: true }));
    expect(validateAction(action({ gcode: 'M1', statusBar: true }), others)).toBe('statusBarFull');
    expect(validateAction(action({ id: 'x', name: 'x', gcode: 'M1', statusBar: true }), others)).toBeNull();
  });

  it('parses plugin data and the PSU state', () => {
    expect(parsePluginData('')).toEqual({});
    expect(parsePluginData('{"pin": 17}')).toEqual({ pin: 17 });
    expect(parsePluginData('{oops')).toBeNull();
    expect(parsePsuState({ isPSUOn: true })).toBe(true);
    expect(parsePsuState({ isPSUOn: 'yes' })).toBeNull();
    expect(parsePsuState(undefined)).toBeNull();
  });
});
