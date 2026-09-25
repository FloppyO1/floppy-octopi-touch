/** Terminal log (serial traffic from `current.logs`), bounded, plus the history of typed commands. */
import { printer as printerApi } from '../api/octoprint';
import { normalizeCommand, pushHistory } from '../core/terminal';

export interface LogLine {
  id: number;
  text: string;
}

const MAX_LINES = 1000;

class TerminalStore {
  lines = $state.raw<LogLine[]>([]);
  /** Commands typed in the terminal, newest first (this session only). */
  history = $state.raw<string[]>([]);
  private nextId = 1;

  reset(lines: readonly string[] | undefined): void {
    this.lines = [];
    this.append(lines);
  }

  append(lines: readonly string[] | undefined): void {
    if (!lines?.length) return;
    const added = lines.map((text) => ({ id: this.nextId++, text }));
    const all = this.lines.concat(added);
    this.lines = all.length > MAX_LINES ? all.slice(all.length - MAX_LINES) : all;
  }

  /** Empties the local copy of the log (OctoPrint keeps its own). */
  clear(): void {
    this.lines = [];
  }

  send = (commands: string | string[]) => printerApi.command(commands);

  /** A command typed by the user: sent as-is (normalized) and remembered in the history. */
  async submit(text: string): Promise<void> {
    const command = normalizeCommand(text);
    if (!command) return;
    await this.send(command);
    this.history = pushHistory(this.history, command);
  }
}

export const terminal = new TerminalStore();
