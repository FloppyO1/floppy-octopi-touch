/** State of the Files screen, kept across navigation (back on Files = same tab and folder). */
import type { FileOrigin } from '../../lib/api/types';

export type Source = FileOrigin | 'usb';

export type Detail =
  | { kind: 'entry'; origin: FileOrigin; path: string }
  | { kind: 'usb'; mount: string; path: string };

class FilesView {
  source = $state<Source>('local');
  /** Current folder of the local storage ('' = root). */
  folder = $state('');
  /** Search query (on-screen keyboard); '' = browse. */
  query = $state('');
  detail = $state.raw<Detail | null>(null);

  show(source: Source): void {
    this.source = source;
    this.query = '';
  }

  open(folder: string): void {
    this.folder = folder;
    this.query = '';
  }
}

export const view = new FilesView();
