/** Files from every source: OctoPrint local storage, the printer's SD card, the Pi's USB stick. */
import { getUsbFiles } from '../api/agent';
import { HttpError } from '../api/http';
import { files as filesApi, printer as printerApi } from '../api/octoprint';
import type { FileEntry, FileOrigin, UsbFile } from '../api/types';
import { splitByOrigin } from '../core/files';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';
/** `unavailable` = the agent has no USB endpoint (before session 5) or no stick support. */
export type UsbStatus = 'unavailable' | 'unmounted' | 'ready' | 'error';

const REFRESH_DEBOUNCE_MS = 500;

class FilesStore {
  /** Recursive tree of the local storage (folders have `children`). */
  local = $state.raw<FileEntry[]>([]);
  sdcard = $state.raw<FileEntry[]>([]);
  usb = $state.raw<UsbFile[]>([]);
  usbStatus = $state<UsbStatus>('unavailable');
  status = $state<LoadStatus>('idle');
  free = $state<number | null>(null);
  total = $state<number | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** One request lists local storage and, when the SD card is ready, its files too. */
  async refresh(): Promise<void> {
    this.status = 'loading';
    try {
      const listing = await filesApi.listAll(true);
      const byOrigin = splitByOrigin(listing.files);
      this.local = byOrigin.local;
      this.sdcard = byOrigin.sdcard;
      this.free = listing.free ?? null;
      this.total = listing.total ?? null;
      this.status = 'ready';
    } catch {
      this.status = 'error';
    }
  }

  /** Coalesces bursts of file events (UpdatedFiles + FileAdded + …) into one request. */
  scheduleRefresh(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.refresh(), REFRESH_DEBOUNCE_MS);
  }

  async refreshUsb(): Promise<void> {
    try {
      const listing = await getUsbFiles();
      this.usb = listing.files;
      this.usbStatus = listing.mounted ? 'ready' : 'unmounted';
    } catch (error) {
      this.usb = [];
      this.usbStatus = error instanceof HttpError && error.status === 404 ? 'unavailable' : 'error';
    }
  }

  /**
   * Asks the printer to re-read its SD card (M20); OctoPrint then fires UpdatedFiles.
   * Never while printing: the serial line is busy and SD listing can stall the printer.
   */
  /** Selects a file and starts printing it (callers confirm first: the bed must be clear). */
  print = (origin: FileOrigin, path: string) => filesApi.select(origin, path, true);

  refreshSd = () => printerApi.sd.refresh();
  initSd = () => printerApi.sd.init();
  releaseSd = () => printerApi.sd.release();
}

export const files = new FilesStore();
