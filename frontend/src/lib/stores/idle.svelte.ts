/**
 * Inactivity tracking for the screensaver and the optional screen off.
 *
 * Every touch (pointerdown) or key counts as activity. The touch that wakes the UI up is
 * swallowed: it and the rest of its pointer sequence (up, click…) are stopped in the capture phase
 * on `window`, before any component sees them, so a wake-up tap never presses a button under
 * the screensaver. Taps right after it (within GUARD_MS) are swallowed too.
 */
import { idleMode, type IdleMode } from '../core/idle';
import { clock } from './clock.svelte';
import { notices } from './notices.svelte';
import { printer } from './printer.svelte';
import { prompt } from './prompt.svelte';
import { settings } from './settings.svelte';

const GUARD_MS = 400;
const CAPTURE = { capture: true, passive: false } as const;
const FOLLOW_UP_EVENTS = ['click', 'dblclick', 'mousedown', 'mouseup', 'contextmenu'] as const;

function block(event: Event): void {
  event.stopImmediatePropagation();
  event.preventDefault();
}

class IdleStore {
  lastActivity = $state(Date.now());
  /** Forced mode (tests, dev tools); cleared by the next activity. */
  forced = $state<IdleMode | null>(null);

  mode = $derived<IdleMode>(
    this.forced ??
      idleMode({
        idleMs: clock.now.getTime() - this.lastActivity,
        screensaver: settings.value.screensaver,
        screenOff: settings.value.screenOff,
        busy: printer.busy,
        attention: notices.current !== null || (prompt.enabled && prompt.active !== null),
      }),
  );

  private swallowing = false;
  private swallowUntil = 0;
  private started = false;

  touch(): void {
    this.lastActivity = Date.now();
    this.forced = null;
  }

  sleep(mode: Exclude<IdleMode, 'active'> = 'screensaver'): void {
    this.forced = mode;
  }

  start(): void {
    if (this.started || typeof window === 'undefined') return;
    this.started = true;
    window.addEventListener('pointerdown', this.onDown, CAPTURE);
    window.addEventListener('pointerup', this.onUp, CAPTURE);
    window.addEventListener('pointercancel', this.onUp, CAPTURE);
    window.addEventListener('keydown', this.onDown, CAPTURE);
    for (const type of FOLLOW_UP_EVENTS) window.addEventListener(type, this.onFollowUp, CAPTURE);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    window.removeEventListener('pointerdown', this.onDown, CAPTURE);
    window.removeEventListener('pointerup', this.onUp, CAPTURE);
    window.removeEventListener('pointercancel', this.onUp, CAPTURE);
    window.removeEventListener('keydown', this.onDown, CAPTURE);
    for (const type of FOLLOW_UP_EVENTS) window.removeEventListener(type, this.onFollowUp, CAPTURE);
  }

  private guarded(): boolean {
    return this.swallowing || performance.now() < this.swallowUntil;
  }

  private onDown = (event: Event) => {
    if (this.mode !== 'active' || this.guarded()) {
      this.swallowing = event.type === 'pointerdown';
      block(event);
    }
    this.touch();
  };

  private onUp = (event: Event) => {
    if (!this.guarded()) return;
    block(event);
    if (this.swallowing) {
      this.swallowing = false;
      this.swallowUntil = performance.now() + GUARD_MS;
    }
  };

  private onFollowUp = (event: Event) => {
    if (this.guarded()) block(event);
  };
}

export const idle = new IdleStore();
