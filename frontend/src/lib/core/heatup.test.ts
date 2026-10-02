import { describe, expect, it } from 'vitest';
import { applyHeatupLines, createHeatupState, heatupOverrideCommands, type HeatupWait } from './heatup';

const feed = (lines: string[], state = createHeatupState()) => {
  applyHeatupLines(state, lines);
  return state;
};

describe('heat-up waits from the log', () => {
  it('opens on a sent M109 and closes on the next ok', () => {
    const state = feed(['Send: N12 M109 S215*80', 'Recv:  T:150.20 /215.00 B:60.00 /60.00 @:127 B@:0']);
    expect(state.wait).toEqual({ code: 'M109', heater: 'tool0', tool: null, target: 215, mode: 'S' });
    feed(['Recv:  T:214.80 /215.00', 'Recv: ok'], state);
    expect(state.wait).toBeNull();
  });

  it('closes on the next sent line too (e.g. the M108 that ended it)', () => {
    const state = feed(['Send: N3 M190 S60*99', 'Send: M108']);
    expect(state.wait).toBeNull();
  });

  it('reads bed, chamber, R, T and the active tool', () => {
    expect(feed(['Send: M190 R45']).wait).toMatchObject({ heater: 'bed', mode: 'R', target: 45 });
    expect(feed(['Send: N9 M191 S40*1']).wait).toMatchObject({ heater: 'chamber', code: 'M191' });
    expect(feed(['Send: M109 S200 T1']).wait).toMatchObject({ heater: 'tool1', tool: 1 });
    expect(feed(['Send: T1', 'Recv: ok', 'Send: M109 S205']).wait).toMatchObject({ heater: 'tool1', tool: null });
  });

  it('ignores non-blocking commands and waits without a value', () => {
    expect(feed(['Send: M104 S200']).wait).toBeNull();
    expect(feed(['Send: M109']).wait).toBeNull();
    expect(feed(['Send: M1090 S1']).wait).toBeNull();
  });
});

describe('commands that end a wait at once', () => {
  const hotend: HeatupWait = { code: 'M109', heater: 'tool0', tool: null, target: 215, mode: 'S' };
  const bed: HeatupWait = { code: 'M190', heater: 'bed', tool: null, target: 60, mode: 'S' };

  it('waits again for the new target of the waiting heater, then M108', () => {
    expect(heatupOverrideCommands(hotend, { tool0: 230 }, { tool0: 150 })).toEqual(['M109 S230', 'M108']);
    expect(heatupOverrideCommands({ ...hotend, tool: 0 }, { tool0: 230 }, {})).toEqual(['M109 S230 T0', 'M108']);
    expect(heatupOverrideCommands(bed, { bed: 70 }, { bed: 40 })).toEqual(['M190 S70', 'M108']);
  });

  it('waits with R for a target below the current temperature', () => {
    expect(heatupOverrideCommands(hotend, { tool0: 190 }, { tool0: 205 })).toEqual(['M109 R190', 'M108']);
  });

  it('turns the waiting heater off without a new wait', () => {
    expect(heatupOverrideCommands(hotend, { tool0: 0 }, { tool0: 150 })).toEqual(['M104 S0', 'M108']);
  });

  it('sets the other heater and restarts the current wait with its target', () => {
    expect(heatupOverrideCommands(bed, { tool0: 210 }, { bed: 40 })).toEqual(['M104 S210 T0', 'M190 S60', 'M108']);
    expect(heatupOverrideCommands(hotend, { bed: 65 }, {})).toEqual(['M140 S65', 'M109 S215', 'M108']);
    expect(heatupOverrideCommands(hotend, { tool0: 0, bed: 0 }, {})).toEqual(['M140 S0', 'M104 S0', 'M108']);
  });
});
