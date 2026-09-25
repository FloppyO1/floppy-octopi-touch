/** Marlin host prompts and notifications (`//action:*` lines), answered with M876 S<n>. */
import { HttpError } from '../api/http';
import { plugin, printer as printerApi } from '../api/octoprint';
import {
  createHostActionState,
  processLogLines,
  type HostPrompt,
} from '../core/hostActions';
import { PLUGIN_IDS } from '../core/printerState';
import { capabilities } from './capabilities.svelte';
import { events } from './events.svelte';
import { server } from './server.svelte';

export interface HostNotification {
  id: number;
  message: string;
  time: number;
}

const MAX_NOTIFICATIONS = 20;

class PromptStore {
  active = $state.raw<HostPrompt | null>(null);
  notifications = $state.raw<HostNotification[]>([]);
  private parser = createHostActionState();
  private nextId = 1;

  /** Prompts are only shown when the firmware supports them (Cap:PROMPT_SUPPORT or override). */
  enabled = $derived(capabilities.resolved.promptSupport.enabled);

  ingest(lines: readonly string[] | undefined): void {
    if (!lines?.length) return;
    for (const event of processLogLines(this.parser, lines)) {
      switch (event.kind) {
        case 'prompt':
          this.active = { text: event.prompt.text, choices: [...event.prompt.choices] };
          events.emit('host:prompt', { text: event.prompt.text, choices: event.prompt.choices });
          break;
        case 'promptClosed':
          this.active = null;
          events.emit('host:promptClosed');
          break;
        case 'notification':
          this.notify(event.message);
          break;
        case 'action':
          events.emit('host:action', { action: event.action, parameter: event.parameter });
          break;
      }
    }
  }

  /**
   * Answers the active prompt. The bundled Action Command Prompt plugin is preferred: it
   * force-sends M876 even while the firmware is busy waiting for the user. The plugin is only
   * active when the firmware reported Cap:PROMPT_SUPPORT (otherwise it silently drops answers), so
   * with a manual override M876 goes through the normal command queue.
   */
  async answer(choice: number): Promise<void> {
    this.active = null;
    this.parser.prompt = null;
    if (server.plugins.actionCommandPrompt && capabilities.resolved.promptSupport.detected) {
      try {
        await plugin.command(PLUGIN_IDS.actionCommandPrompt, 'select', { choice });
        return;
      } catch (error) {
        // 409 = the plugin did not register this prompt (e.g. capability not detected).
        if (!(error instanceof HttpError) || error.status !== 409) throw error;
      }
    }
    await printerApi.command(`M876 S${choice}`);
  }

  dismissNotification(id: number): void {
    this.notifications = this.notifications.filter((n) => n.id !== id);
  }

  reset(): void {
    this.parser = createHostActionState();
    this.active = null;
  }

  private notify(message: string): void {
    if (!message) return;
    const notification = { id: this.nextId++, message, time: Date.now() };
    this.notifications = [notification, ...this.notifications].slice(0, MAX_NOTIFICATIONS);
    events.emit('host:notification', { message });
  }
}

export const prompt = new PromptStore();
