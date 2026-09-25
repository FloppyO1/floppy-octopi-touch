/**
 * Host information from the agent (`/local/system`) and OctoPrint's system commands.
 *
 * Polled only while someone watches: the status bar every 30 s (network), the System screen every
 * few seconds (CPU/RAM/disk). The fastest watcher sets the pace.
 */
import { getSystemInfo } from '../api/agent';
import { system as systemApi } from '../api/octoprint';
import type { SystemInfo } from '../api/types';
import { networkSummary, systemActions, type SystemAction } from '../core/system';

class SystemStore {
  info = $state.raw<SystemInfo | null>(null);
  error = $state<string | null>(null);
  network = $derived(networkSummary(this.info?.network));
  /** OctoPrint's system commands (restart, reboot, shutdown, custom ones), `null` until loaded. */
  commands = $state.raw<SystemAction[] | null>(null);
  commandsError = $state(false);

  private watchers = new Map<number, number>();
  private nextWatcher = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private inFlight: Promise<void> | null = null;

  refresh(): Promise<void> {
    this.inFlight ??= (async () => {
      try {
        this.info = await getSystemInfo();
        this.error = null;
      } catch (error) {
        this.error = String(error);
      } finally {
        this.inFlight = null;
      }
    })();
    return this.inFlight;
  }

  /** Polls every `intervalMs` (or faster if another watcher asks) until the returned function runs. */
  watch(intervalMs: number): () => void {
    const id = this.nextWatcher++;
    this.watchers.set(id, intervalMs);
    this.reschedule(true);
    return () => {
      this.watchers.delete(id);
      this.reschedule(false);
    };
  }

  async loadCommands(): Promise<void> {
    try {
      this.commands = systemActions(await systemApi.commands());
      this.commandsError = false;
    } catch {
      this.commandsError = true;
    }
  }

  private reschedule(refreshNow: boolean): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // A tick still waiting for its answer must not start a second chain.
    const generation = ++this.generation;
    if (!this.watchers.size) return;
    const interval = Math.min(...this.watchers.values());
    const tick = async () => {
      await this.refresh();
      if (generation === this.generation && this.watchers.size) {
        this.timer = setTimeout(tick, Math.min(...this.watchers.values()));
      }
    };
    if (refreshNow) void tick();
    else this.timer = setTimeout(tick, interval);
  }
}

export const system = new SystemStore();
