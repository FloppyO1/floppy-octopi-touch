/** Terminal log (serial traffic from `current.logs`), bounded. */
import { printer as printerApi } from '../api/octoprint';

export interface LogLine {
  id: number;
  text: string;
}

const MAX_LINES = 1000;

class TerminalStore {
  lines = $state.raw<LogLine[]>([]);
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

  send = (commands: string | string[]) => printerApi.command(commands);
}

export const terminal = new TerminalStore();
