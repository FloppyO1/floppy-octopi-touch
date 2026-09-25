/**
 * Marlin host action commands (`//action:…`), read from the terminal log.
 *
 *   //action:prompt_begin <text>      start building a prompt
 *   //action:prompt_choice <label>    add a choice (prompt_button is an alias)
 *   //action:prompt_show              show it; the answer is sent with M876 S<index>
 *   //action:prompt_end               close it (answered on the printer, timeout…)
 *   //action:notification <text>      message for the user (also M117 with HOST_STATUS_NOTIFICATIONS)
 *   //action:pause|paused|resume|resumed|cancel|…
 */

export interface HostPrompt {
  text: string;
  choices: string[];
}

export interface HostActionState {
  /** Prompt being built between prompt_begin and prompt_show. */
  building: HostPrompt | null;
  /** Prompt currently shown to the user. */
  prompt: HostPrompt | null;
}

export type HostActionEvent =
  | { kind: 'prompt'; prompt: HostPrompt }
  | { kind: 'promptClosed' }
  | { kind: 'notification'; message: string }
  | { kind: 'action'; action: string; parameter: string };

export interface ParsedAction {
  action: string;
  parameter: string;
}

const ACTION_RE = /^(?:Recv:\s*)?\/\/\s*action:\s*(\S+)(?:\s+(.*))?$/;

/** Parses one terminal line; `null` if it is not a host action. */
export function parseActionLine(line: string): ParsedAction | null {
  const match = ACTION_RE.exec(line.trim());
  if (!match) return null;
  return { action: match[1], parameter: (match[2] ?? '').trim() };
}

export function createHostActionState(): HostActionState {
  return { building: null, prompt: null };
}

/** Applies one action to `state` (mutated) and returns what the UI should react to, if anything. */
export function applyHostAction(state: HostActionState, action: ParsedAction): HostActionEvent | null {
  switch (action.action) {
    case 'prompt_begin':
      state.building = { text: action.parameter, choices: [] };
      return null;
    case 'prompt_choice':
    case 'prompt_button':
      state.building?.choices.push(action.parameter);
      return null;
    case 'prompt_show':
      if (!state.building) return null;
      state.prompt = state.building;
      state.building = null;
      return { kind: 'prompt', prompt: state.prompt };
    case 'prompt_end': {
      const wasOpen = state.prompt !== null;
      state.prompt = null;
      state.building = null;
      return wasOpen ? { kind: 'promptClosed' } : null;
    }
    case 'notification':
      return { kind: 'notification', message: action.parameter };
    default:
      return { kind: 'action', action: action.action, parameter: action.parameter };
  }
}

/** Convenience: parses and applies a batch of log lines, returning the resulting events in order. */
export function processLogLines(state: HostActionState, lines: readonly string[]): HostActionEvent[] {
  const events: HostActionEvent[] = [];
  for (const line of lines) {
    const action = parseActionLine(line);
    if (!action) continue;
    const event = applyHostAction(state, action);
    if (event) events.push(event);
  }
  return events;
}
