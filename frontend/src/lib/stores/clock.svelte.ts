/**
 * Wall clock shared by the status bar and the screensaver (ticks once per second once started),
 * and the Pi's date/time settings from the agent. Every formatted time uses the Pi's time zone.
 */
import { getTime, setTime, type TimeChange, type TimeState } from '../api/agent';
import { useTimeZone } from '../core/format';
import { isUsableTimeZone } from '../core/timezone';

class ClockStore {
  now = $state(new Date());
  /** Last answer of `/local/time` (`null` until loaded). */
  time = $state.raw<TimeState | null>(null);
  /** IANA zone used for every displayed time; `undefined` = the browser's own. */
  timeZone = $derived(
    this.time?.available && isUsableTimeZone(this.time.timezone) ? this.time.timezone : undefined,
  );
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
    void this.refresh().catch(() => undefined);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick(): void {
    this.now = new Date();
  }

  /** Reloads the state (with the list of zones for the settings screen). */
  async refresh(zones = false): Promise<TimeState> {
    const state = await getTime(zones);
    // Keep the zone list across lighter reloads.
    const previous = this.time;
    if (!zones && state.available && previous?.available && previous.timezones) {
      state.timezones = previous.timezones;
    }
    this.time = state;
    return state;
  }

  /** Applies a change on the Pi; throws the agent's HttpError (403, 409 `ntp_active`, 503…). */
  async change(change: TimeChange): Promise<TimeState> {
    const state = await setTime(change);
    const previous = this.time;
    if (state.available && previous?.available && previous.timezones) state.timezones = previous.timezones;
    this.time = state;
    this.tick();
    return state;
  }
}

export const clock = new ClockStore();
useTimeZone(() => clock.timeZone);
