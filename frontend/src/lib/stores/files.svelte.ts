/** Files of OctoPrint's local storage and of the printer's SD card (USB sticks: `usb` store). */
import { files as filesApi, printer as printerApi } from '../api/octoprint';
import type { FileEntry, FileOrigin, JobFile } from '../api/types';
import { findFile, splitByOrigin, thumbnailUrl } from '../core/files';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

const REFRESH_DEBOUNCE_MS = 500;

class FilesStore {
  /** Recursive tree of the local storage (folders have `children`). */
  local = $state.raw<FileEntry[]>([]);
  sdcard = $state.raw<FileEntry[]>([]);
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

  find(origin: FileOrigin, path: string): FileEntry | null {
    return findFile(origin === 'sdcard' ? this.sdcard : this.local, path);
  }

  /** Thumbnail of the job's file (the listing entry knows about the Slicer Thumbnails plugin). */
  thumbnailFor(file: JobFile | null | undefined): string | null {
    if (!file?.path || !file.origin) return null;
    return thumbnailUrl(this.find(file.origin, file.path) ?? { ...file, origin: file.origin, path: file.path });
  }

  /** Selects a file and starts printing it (callers confirm first: the bed must be clear). */
  print = (origin: FileOrigin, path: string) => filesApi.select(origin, path, true);
  select = (origin: FileOrigin, path: string) => filesApi.select(origin, path, false);
  remove = (origin: FileOrigin, path: string) => filesApi.remove(origin, path);

  /**
   * SD card commands (M21/M20/M22); OctoPrint then fires UpdatedFiles. Never while printing:
   * the serial line is busy and listing the card can stall the printer.
   */
  refreshSd = () => printerApi.sd.refresh();
  initSd = () => printerApi.sd.init();
  releaseSd = () => printerApi.sd.release();
}

export const files = new FilesStore();
