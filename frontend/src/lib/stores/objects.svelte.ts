/**
 * Objects of the running job that can be cancelled (see core/objects): shapes from the agent, state
 * from the Cancel Objects plugin (socket messages + objlist) or from the M486 lines of the log.
 */
import { getObjects } from '../api/agent';
import { plugin, printer as printerApi } from '../api/octoprint';
import type { JobFile } from '../api/types';
import {
  buildObjects,
  cancelMethod,
  emptyM486,
  ingestM486,
  type M486State,
  type ObjectsReport,
  type PluginObject,
  type PrintObject,
} from '../core/objects';
import { PLUGIN_IDS } from '../core/printerState';
import { capabilities } from './capabilities.svelte';
import { printer } from './printer.svelte';
import { server } from './server.svelte';

const PLUGIN = PLUGIN_IDS.cancelObjects;

function pluginList(value: unknown): PluginObject[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((o): o is Record<string, unknown> => typeof o === 'object' && o !== null)
    .filter((o) => typeof o.id === 'number' && typeof o.object === 'string')
    .map((o) => ({ id: o.id as number, object: o.object as string, cancelled: o.cancelled === true, ignore: o.ignore === true }));
}

class ObjectsStore {
  report = $state.raw<ObjectsReport | null>(null);
  plugin = $state.raw<PluginObject[]>([]);
  pluginActive = $state<number | null>(null);
  m486 = $state.raw<M486State>(emptyM486());
  private fileKey: string | null = null;

  method = $derived(cancelMethod(capabilities.has('cancelObjects'), server.plugins.cancelObjects));
  list = $derived<PrintObject[]>(
    buildObjects({
      method: this.method,
      report: this.report,
      plugin: this.plugin,
      pluginActive: this.pluginActive,
      m486: this.m486,
    }),
  );
  /** Something can be cancelled right now. */
  cancellable = $derived(printer.busy && this.list.filter((o) => o.target !== null).length >= 2);
  /** The file has objects, but the plugin never saw it being uploaded: it must be uploaded again. */
  needsUpload = $derived(
    this.method === 'plugin' &&
      this.plugin.length === 0 &&
      (this.report?.objects.length ?? 0) >= 2 &&
      this.report?.processed === false,
  );

  /** Follows the job's file (Home calls it while a job exists). */
  sync(file: JobFile | null): void {
    const key = file?.origin === 'local' && file.path ? `${file.path}@${file.date ?? ''}` : null;
    if (key === this.fileKey) return;
    this.fileKey = key;
    this.report = null;
    if (!key || !file?.path) return;
    const path = file.path;
    getObjects(path)
      .then((report) => {
        if (this.fileKey === key) this.report = report;
      })
      .catch(() => {
        /* no shapes: the list still works with the plugin */
      });
    if (this.method === 'plugin' && this.plugin.length === 0) void this.refreshPlugin();
  }

  /** A new job starts from a clean state. */
  reset(): void {
    this.m486 = emptyM486();
    this.pluginActive = null;
  }

  ingestLog(lines: readonly string[]): void {
    const next = ingestM486(lines, this.m486);
    if (next !== this.m486) this.m486 = next;
  }

  ingestPlugin(id: string, data: unknown): void {
    if (id !== PLUGIN || typeof data !== 'object' || data === null) return;
    const message = data as Record<string, unknown>;
    const list = pluginList(message.objects);
    if (list) this.plugin = list;
    if ('ActiveID' in message) this.pluginActive = typeof message.ActiveID === 'number' ? message.ActiveID : null;
  }

  async refreshPlugin(): Promise<void> {
    try {
      const response = await plugin.command<{ list?: unknown }>(PLUGIN, 'objlist');
      const list = pluginList(response?.list);
      if (list) this.plugin = list;
    } catch {
      /* plugin missing or OctoPrint busy: the socket messages keep it up to date */
    }
  }

  async cancel(object: PrintObject): Promise<void> {
    if (object.target === null) return;
    if (this.method === 'm486') {
      await printerApi.command(`M486 P${object.target}`);
      if (!this.m486.cancelled.includes(object.target)) {
        this.m486 = { ...this.m486, cancelled: [...this.m486.cancelled, object.target] };
      }
    } else if (this.method === 'plugin') {
      await plugin.command(PLUGIN, 'cancel', { cancelled: object.target });
      this.plugin = this.plugin.map((p) => (p.id === object.target ? { ...p, cancelled: true } : p));
      void this.refreshPlugin();
    }
  }
}

export const objects = new ObjectsStore();
