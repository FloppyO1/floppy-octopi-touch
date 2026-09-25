<script lang="ts">
  // Detail of a local or SD card file: large thumbnail, slicer analysis, print/select/delete.
  import Box from '@lucide/svelte/icons/box';
  import FileText from '@lucide/svelte/icons/file-text';
  import MousePointerClick from '@lucide/svelte/icons/mouse-pointer-click';
  import Play from '@lucide/svelte/icons/play';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import type { FileOrigin } from '../../lib/api/types';
  import { parentPath, thumbnailUrl } from '../../lib/core/files';
  import { formatBytes, formatDuration, formatFileDate } from '../../lib/core/format';
  import { i18n, t } from '../../lib/i18n/index.svelte';
  import { files, printer, settings } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import Modal from '../../lib/ui/Modal.svelte';
  import Thumb from '../../lib/ui/Thumb.svelte';
  import { deleteFile, selectFile, startPrint } from './actions';

  interface Props {
    origin: FileOrigin;
    path: string;
    onclose: () => void;
  }

  let { origin, path, onclose }: Props = $props();

  const entry = $derived(files.find(origin, path));
  const name = $derived(entry ? entry.display || entry.name : path);
  const analysis = $derived(entry?.gcodeAnalysis);
  const busy = $derived(printer.busyFiles.some((f) => f.origin === origin && f.path === path));
  const canPrint = $derived(printer.operational && !printer.busy);
  const hour12 = $derived(!settings.value.clock24h);

  const filament = $derived.by(() => {
    const tools = Object.values(analysis?.filament ?? {});
    const length = tools.reduce((sum, tool) => sum + (tool?.length ?? 0), 0);
    return length > 0 ? `${(length / 1000).toFixed(2)} m` : '—';
  });
  const dimensions = $derived.by(() => {
    const d = analysis?.dimensions;
    return d ? `${d.width.toFixed(1)} × ${d.depth.toFixed(1)} × ${d.height.toFixed(1)} mm` : '—';
  });
  const lastPrint = $derived.by(() => {
    const last = entry?.prints?.last;
    if (!last) return null;
    const date = formatFileDate(last.date, i18n.locale, hour12);
    return t(last.success ? 'files.lastOk' : 'files.lastFailed', { date });
  });

  // Deleted meanwhile (here or from another client): nothing left to show.
  $effect(() => {
    if (files.status === 'ready' && !entry) onclose();
  });

  async function remove() {
    if (await deleteFile(origin, path, name)) onclose();
  }

  async function print() {
    onclose();
    await startPrint(origin, path, name);
  }

  async function select() {
    await selectFile(origin, path, name);
    onclose();
  }
</script>

<Modal title={name} icon={FileText} width={900} {onclose} testid="file-detail">
  <div class="detail">
    <div class="preview">
      <Thumb src={origin === 'local' ? thumbnailUrl(entry) : null} icon={Box} iconSize={88} alt={t('preview.thumbnail')} />
    </div>
    <dl class="tabular">
      {#if origin === 'local'}
        <dt>{t('files.estimate')}</dt>
        <dd data-testid="detail-estimate">
          {analysis ? formatDuration(analysis.estimatedPrintTime) : t('files.analysing')}
        </dd>
        <dt>{t('files.filament')}</dt>
        <dd>{analysis ? filament : '—'}</dd>
        <dt>{t('files.dimensions')}</dt>
        <dd>{dimensions}</dd>
      {/if}
      <dt>{t('files.size')}</dt>
      <dd>{formatBytes(entry?.size)}</dd>
      <dt>{t('files.uploaded')}</dt>
      <dd>{formatFileDate(entry?.date, i18n.locale, hour12)}</dd>
      {#if parentPath(path)}
        <dt>{t('files.folder')}</dt>
        <dd>{parentPath(path)}</dd>
      {/if}
      {#if entry?.prints && entry.prints.success + entry.prints.failure > 0}
        <dt>{t('files.prints')}</dt>
        <dd>{t('files.printsValue', { ok: entry.prints.success, failed: entry.prints.failure })}</dd>
      {/if}
      {#if lastPrint}
        <dt>{t('files.lastPrint')}</dt>
        <dd>{lastPrint}</dd>
      {/if}
    </dl>
  </div>
  {#snippet actions()}
    <Button variant="danger" size="lg" icon={Trash2} disabled={busy} onclick={remove} data-testid="detail-delete">
      {t('common.delete')}
    </Button>
    <span class="spacer"></span>
    <Button size="lg" icon={MousePointerClick} disabled={!canPrint} onclick={select} data-testid="detail-select">
      {t('files.select')}
    </Button>
    <Button variant="primary" size="lg" icon={Play} disabled={!canPrint} onclick={print} data-testid="detail-print">
      {t('job.print')}
    </Button>
  {/snippet}
</Modal>

<style>
  .detail {
    display: grid;
    grid-template-columns: 400px 1fr;
    gap: var(--sp-5);
    align-items: start;
  }
  .preview {
    height: 280px;
    border-radius: var(--r-md);
    overflow: hidden;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--sp-3) var(--sp-4);
    margin: 0;
    font-size: var(--fs-md);
  }
  dt {
    color: var(--text-dim);
  }
  dd {
    margin: 0;
    color: var(--text);
    font-weight: var(--fw-medium);
    overflow-wrap: anywhere;
  }
  .spacer {
    flex: 1;
  }
</style>
