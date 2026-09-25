/** Wall clock shared by the status bar and the screensaver (ticks once per second once started). */

class ClockStore {
  now = $state(new Date());
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer) return;
    this.now = new Date();
    this.timer = setInterval(() => (this.now = new Date()), 1000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

export const clock = new ClockStore();
