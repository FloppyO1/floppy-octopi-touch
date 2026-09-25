import { describe, expect, it } from 'vitest';
import type { TemperatureSample } from '../api/types';
import { capabilities } from './capabilities.svelte';
import { events } from './events.svelte';
import { screenFromHash } from './nav.svelte';
import { prompt } from './prompt.svelte';
import { settings } from './settings.svelte';
import { temperatures } from './temperatures.svelte';
import { terminal } from './terminal.svelte';

const sample = (time: number, tool: number): TemperatureSample => ({
  time,
  tool0: { actual: tool, target: 210 },
  bed: { actual: 60, target: 60 },
  chamber: { actual: null, target: null },
});

describe('temperature store', () => {
  it('loads the history, then appends live samples', () => {
    temperatures.reset([sample(1, 20), sample(2, 30)]);
    expect(temperatures.heaters).toEqual(['tool0', 'bed']);
    expect(temperatures.latest.tool0).toEqual({ actual: 30, target: 210 });
    const revision = temperatures.revision;

    temperatures.add([sample(3, 40)]);
    expect(temperatures.latest.tool0.actual).toBe(40);
    expect(temperatures.history.length).toBe(3);
    expect(temperatures.revision).toBe(revision + 1);

    // Nothing new (empty `temps` of most `current` messages): no update.
    temperatures.add([]);
    temperatures.add([sample(3, 40)]);
    expect(temperatures.revision).toBe(revision + 1);
  });

  it('hides heaters without readings (Virtual Printer chamber)', () => {
    temperatures.reset([sample(1, 20)]);
    expect(temperatures.latest).not.toHaveProperty('chamber');
  });
});

describe('capability store', () => {
  it('combines the M115 report with the overrides from settings', () => {
    capabilities.reset();
    expect(capabilities.known).toBe(false);
    // Read before the report arrives: the derived state must still update afterwards.
    expect(capabilities.has('eeprom')).toBe(false);
    capabilities.ingest(['Recv: Cap:EEPROM:1', 'Recv: Cap:PROMPT_SUPPORT:0']);
    expect(capabilities.known).toBe(true);
    expect(capabilities.has('eeprom')).toBe(true);
    expect(capabilities.has('promptSupport')).toBe(false);

    settings.value.capabilities.overrides.promptSupport = 'on';
    expect(capabilities.has('promptSupport')).toBe(true);
    expect(prompt.enabled).toBe(true);
    settings.value.capabilities.overrides.promptSupport = 'auto';
  });
});

describe('prompt store', () => {
  it('shows prompts and notifications from live log lines and emits host events', () => {
    const seen: string[] = [];
    const off = events.on('*', (e) => seen.push(e.type));
    prompt.reset();
    prompt.ingest([
      'Recv: //action:prompt_begin Filament runout',
      'Recv: //action:prompt_choice Continue',
      'Recv: //action:prompt_show',
      'Recv: //action:notification Load filament',
    ]);
    expect(prompt.active).toEqual({ text: 'Filament runout', choices: ['Continue'] });
    expect(prompt.notifications[0].message).toBe('Load filament');

    prompt.ingest(['Recv: //action:prompt_end']);
    expect(prompt.active).toBeNull();
    expect(seen).toEqual(['host:prompt', 'host:notification', 'host:promptClosed']);
    off();
  });
});

describe('terminal store', () => {
  it('keeps at most 1000 lines with increasing ids', () => {
    terminal.reset(['a', 'b']);
    terminal.append(Array.from({ length: 1200 }, (_, i) => `line ${i}`));
    expect(terminal.lines).toHaveLength(1000);
    expect(terminal.lines.at(-1)?.text).toBe('line 1199');
    expect(terminal.lines[1].id).toBe(terminal.lines[0].id + 1);
  });
});

describe('event store', () => {
  it('delivers events to type and wildcard subscribers until unsubscribed', () => {
    const got: string[] = [];
    const off = events.on('PrintDone', (e) => got.push(`${e.type}:${e.payload?.name}`));
    events.emit('PrintDone', { name: 'cube.gcode' });
    events.emit('PrintFailed', null);
    off();
    events.emit('PrintDone', { name: 'again.gcode' });
    expect(got).toEqual(['PrintDone:cube.gcode']);
    expect(events.recent[0].type).toBe('PrintDone');
  });
});

describe('navigation', () => {
  it('reads the screen from the URL hash', () => {
    expect(screenFromHash('#/files')).toBe('files');
    expect(screenFromHash('#system')).toBe('system');
    expect(screenFromHash('#/move/extra?x=1')).toBe('move');
    expect(screenFromHash('')).toBe('home');
    expect(screenFromHash('#/nope')).toBe('home');
  });
});
