/**
 * USB sticks plugged into the Pi, through the agent: mount changes are pushed (`/local/events`),
 * files are listed on demand, one import at a time into OctoPrint's local storage.
 * Emits `usb:inserted` / `usb:removed` on the events bus (the app shows a toast).
 */
import { ejectUsb, getUsb, importUsbFile, subscribeAgentEvents } from '../api/agent';
import type { UsbFile, UsbImportResult, UsbMount } from '../api/types';
import { events } from './events.svelte';
import type { LoadStatus } from './files.svelte';

export interface UsbImport {
  file: UsbFile;
  sent: number;
  total: number;
}

class UsbStore {
  mounts = $state.raw<UsbMount[]>([]);
  files = $state.raw<UsbFile[]>([]);
  status = $state<LoadStatus>('idle');
  importing = $state.raw<UsbImport | null>(null);
  private controller: AbortController | null = null;
  private unsubscribe: (() => void) | null = null;
  /** The first event is the current state, not an insertion. */
  private initialised = false;

  start(): void {
    if (this.unsubscribe) return;
    this.unsubscribe = subscribeAgentEvents({ usb: (mounts) => this.onMounts(mounts) });
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.initialised = false;
  }

  private onMounts(mounts: UsbMount[]): void {
    const ids = (list: UsbMount[]) => new Set(list.map((m) => m.id));
    const before = ids(this.mounts);
    const now = ids(mounts);
    if (this.initialised) {
      for (const m of mounts) if (!before.has(m.id)) events.emit('usb:inserted', { name: m.name });
      for (const m of this.mounts) if (!now.has(m.id)) events.emit('usb:removed', { name: m.name });
    }
    this.initialised = true;
    this.mounts = mounts;
    void this.refresh();
  }

  async refresh(): Promise<void> {
    this.status = 'loading';
    try {
      const listing = await getUsb();
      this.mounts = listing.mounts;
      this.files = listing.files;
      this.status = 'ready';
    } catch {
      this.status = 'error';
    }
  }

  async eject(mount: string): Promise<void> {
    await ejectUsb(mount);
    this.mounts = this.mounts.filter((m) => m.id !== mount);
    this.files = this.files.filter((f) => f.mount !== mount);
  }

  /** Copies a stick file into `folder` of the local storage; rejects if cancelled or failed. */
  async importFile(file: UsbFile, folder: string): Promise<UsbImportResult> {
    if (this.importing) throw new Error('an import is already running');
    this.controller = new AbortController();
    this.importing = { file, sent: 0, total: file.size };
    try {
      return await importUsbFile(
        { mount: file.mount, path: file.path, folder },
        {
          signal: this.controller.signal,
          onProgress: (sent, total) => (this.importing = { file, sent, total }),
        },
      );
    } finally {
      this.importing = null;
      this.controller = null;
    }
  }

  cancelImport(): void {
    this.controller?.abort();
  }
}

export const usb = new UsbStore();
