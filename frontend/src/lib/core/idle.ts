/**
 * Inactivity: which "sleep" level the UI is in.
 *
 *   active       normal UI
 *   screensaver  big minimal view (progress while printing, clock + temperatures otherwise)
 *   off          HDMI output off; only when no job is running (never while printing)
 *
 * Anything that needs the user's attention (host prompt, print notice) keeps the UI active.
 */

export type IdleMode = 'active' | 'screensaver' | 'off';

export interface IdleInput {
  /** Milliseconds since the last touch/key. */
  idleMs: number;
  screensaver: { enabled: boolean; timeoutMin: number };
  screenOff: { enabled: boolean; timeoutMin: number };
  /** A job exists (printing, paused, cancelling…). */
  busy: boolean;
  /** Something waits for the user. */
  attention: boolean;
}

const MINUTE_MS = 60_000;

const reached = (idleMs: number, option: { enabled: boolean; timeoutMin: number }) =>
  option.enabled && option.timeoutMin > 0 && idleMs >= option.timeoutMin * MINUTE_MS;

export function idleMode(input: IdleInput): IdleMode {
  if (input.attention) return 'active';
  if (!input.busy && reached(input.idleMs, input.screenOff)) return 'off';
  if (reached(input.idleMs, input.screensaver)) return 'screensaver';
  return 'active';
}
