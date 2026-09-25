/** Files screen actions, with confirmations and toasts. */
import { HttpError } from '../../lib/api/http';
import type { FileOrigin, UsbFile, UsbImportResult } from '../../lib/api/types';
import { folderChildren } from '../../lib/core/files';
import { t } from '../../lib/i18n/index.svelte';
import { files, usb } from '../../lib/stores';
import { dialogs } from '../../lib/ui/dialogs.svelte';
import { toast } from '../../lib/ui/toast.svelte';

export { startPrint } from '../home/actions';

/** Deletes after a confirmation; resolves true when the file is gone. */
export async function deleteFile(origin: FileOrigin, path: string, name: string): Promise<boolean> {
  const ok = await dialogs.confirm({
    title: t('files.deleteTitle'),
    message: t('files.deleteMessage', { name, storage: t(`files.${origin}`) }),
    confirmLabel: t('common.delete'),
    tone: 'danger',
  });
  if (!ok) return false;
  try {
    await files.remove(origin, path);
    toast.show(t('files.deleted', { name }), { tone: 'ok' });
    files.scheduleRefresh();
    return true;
  } catch {
    toast.show(t('files.deleteFailed'), { tone: 'error' });
    return false;
  }
}

export async function selectFile(origin: FileOrigin, path: string, name: string): Promise<void> {
  try {
    await files.select(origin, path);
    toast.show(t('files.selected', { name }), { tone: 'ok' });
  } catch {
    toast.show(t('files.actionFailed'), { tone: 'error' });
  }
}

/** SD card commands: failures (printer busy, no card) become a toast. */
export async function sdCommand(command: () => Promise<unknown>): Promise<void> {
  try {
    await command();
  } catch {
    toast.show(t('files.actionFailed'), { tone: 'error' });
  }
}

export async function ejectStick(mount: string): Promise<void> {
  try {
    await usb.eject(mount);
    toast.show(t('files.ejected'), { tone: 'ok', durationMs: 6000 });
  } catch {
    toast.show(t('files.ejectFailed'), { tone: 'error' });
  }
}

/**
 * Copies a stick file into `folder` (asking before replacing a file with the same name).
 * Resolves with the new local file, or null if cancelled or failed.
 */
export async function importFromUsb(file: UsbFile, folder: string): Promise<UsbImportResult | null> {
  const existing = folderChildren(files.local, folder) ?? [];
  if (existing.some((e) => e.type !== 'folder' && e.name === file.name)) {
    const ok = await dialogs.confirm({
      title: t('files.overwriteTitle'),
      message: t('files.overwriteMessage', { name: file.name, folder: folder || t('files.rootFolder') }),
      confirmLabel: t('files.overwrite'),
      tone: 'warning',
    });
    if (!ok) return null;
  }
  try {
    const result = await usb.importFile(file, folder);
    await files.refresh();
    toast.show(t('files.imported', { name: result.name }), { tone: 'ok' });
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      toast.show(t('files.importCancelled'));
    } else if (error instanceof HttpError && error.status === 413) {
      toast.show(t('files.tooLarge'), { tone: 'error' });
    } else {
      toast.show(t('files.importFailed'), { tone: 'error' });
    }
    return null;
  }
}
