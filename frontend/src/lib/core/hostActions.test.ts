import { describe, expect, it } from 'vitest';
import { createHostActionState, parseActionLine, processLogLines } from './hostActions';

describe('parseActionLine', () => {
  it('parses host actions with or without the Recv prefix', () => {
    expect(parseActionLine('Recv: //action:prompt_begin Filament runout')).toEqual({
      action: 'prompt_begin',
      parameter: 'Filament runout',
    });
    expect(parseActionLine('//action:prompt_show')).toEqual({ action: 'prompt_show', parameter: '' });
    expect(parseActionLine('Recv: // action:pause')).toEqual({ action: 'pause', parameter: '' });
  });

  it('ignores everything else', () => {
    expect(parseActionLine('Recv: ok')).toBeNull();
    expect(parseActionLine('Send: M876 S0')).toBeNull();
    expect(parseActionLine('Send: !!DEBUG:action_custom prompt_show')).toBeNull();
    expect(parseActionLine('Recv: echo:busy: paused for user')).toBeNull();
  });
});

describe('processLogLines', () => {
  // Marlin M600 sequence with a filament runout prompt.
  const M600 = [
    'Recv: //action:paused filament_runout',
    'Recv: //action:prompt_end',
    'Recv: //action:prompt_begin Filament Runout',
    'Recv: //action:prompt_choice Continue',
    'Recv: //action:prompt_button Purge More',
    'Recv: //action:prompt_show',
    'Recv: echo:busy: paused for user',
  ];

  it('builds and shows a prompt with its choices', () => {
    const state = createHostActionState();
    const events = processLogLines(state, M600);
    expect(events).toEqual([
      { kind: 'action', action: 'paused', parameter: 'filament_runout' },
      { kind: 'prompt', prompt: { text: 'Filament Runout', choices: ['Continue', 'Purge More'] } },
    ]);
    expect(state.prompt?.choices).toHaveLength(2);
    expect(state.building).toBeNull();
  });

  it('closes an open prompt on prompt_end, only once', () => {
    const state = createHostActionState();
    processLogLines(state, M600);
    expect(processLogLines(state, ['Recv: //action:prompt_end', 'Recv: //action:prompt_end'])).toEqual([
      { kind: 'promptClosed' },
    ]);
    expect(state.prompt).toBeNull();
  });

  it('a new prompt replaces the previous one', () => {
    const state = createHostActionState();
    processLogLines(state, M600);
    const events = processLogLines(state, [
      'Recv: //action:prompt_begin Nozzle Parked',
      'Recv: //action:prompt_button Continue',
      'Recv: //action:prompt_show',
    ]);
    expect(events).toEqual([
      { kind: 'prompt', prompt: { text: 'Nozzle Parked', choices: ['Continue'] } },
    ]);
  });

  it('ignores choices and show without prompt_begin', () => {
    const state = createHostActionState();
    expect(
      processLogLines(state, ['Recv: //action:prompt_choice Orphan', 'Recv: //action:prompt_show']),
    ).toEqual([]);
  });

  it('reports notifications', () => {
    const state = createHostActionState();
    expect(processLogLines(state, ['Recv: //action:notification Heating done'])).toEqual([
      { kind: 'notification', message: 'Heating done' },
    ]);
  });
});
