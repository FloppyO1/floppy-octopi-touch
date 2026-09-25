<script lang="ts">
  // Home without a job: the selected/recent files ready to print and quick actions.
  import Box from '@lucide/svelte/icons/box';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import History from '@lucide/svelte/icons/history';
  import House from '@lucide/svelte/icons/house';
  import Play from '@lucide/svelte/icons/play';
  import Snowflake from '@lucide/svelte/icons/snowflake';
  import Thermometer from '@lucide/svelte/icons/thermometer';
  import Zap from '@lucide/svelte/icons/zap';
  import type { FileEntry, FileOrigin } from '../../lib/api/types';
  import { findFile, recentFiles, thumbnailUrl } from '../../lib/core/files';
  import { formatDuration } from '../../lib/core/format';
  import { t } from '../../lib/i18n/index.svelte';
  import { files, job, nav, printer, settings } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import Card from '../../lib/ui/Card.svelte';
  import { toast } from '../../lib/ui/toast.svelte';
  import { cooldown, preheat } from '../heaterTarget';
  import { startPrint } from './actions';

  interface Row {
    key: string;
    origin: FileOrigin;
    path: string;
    name: string;
    entry: FileEntry | null;
    selected: boolean;
  }

  const MAX_ROWS = 3;

  const rows = $derived.by<Row[]>(() => {
    const out: Row[] = [];
    const selected = job.file;
    if (selected?.path && selected.origin) {
      const entry = findFile(selected.origin === 'sdcard' ? files.sdcard : files.local, selected.path);
      out.push({
        key: `${selected.origin}:${selected.path}`,
        origin: selected.origin,
        path: selected.path,
        name: selected.display ?? selected.name ?? selected.path,
        entry,
        selected: true,
      });
    }
    for (const entry of recentFiles(files.local, MAX_ROWS + 1)) {
      if (out.length >= MAX_ROWS) break;
      if (out.some((r) => r.origin === 'local' && r.path === entry.path)) continue;
      out.push({
        key: `local:${entry.path}`,
        origin: 'local',
        path: entry.path,
        name: entry.display || entry.name,
        entry,
        selected: false,
      });
    }
    return out;
  });

  const presets = $derived(settings.value.presets.slice(0, 3));
  const canPrint = $derived(printer.operational && !printer.busy);

  function meta(row: Row): string {
    const estimate = row.entry?.gcodeAnalysis?.estimatedPrintTime;
    const parts = [estimate ? t('idle.estimate', { time: formatDuration(estimate) }) : null];
    if (row.origin === 'sdcard') parts.push(t('idle.sdcard'));
    const last = row.entry?.prints?.last;
    if (last) parts.push(t(last.success ? 'idle.lastOk' : 'idle.lastFailed'));
    return parts.filter(Boolean).join(' · ');
  }

  async function home() {
    try {
      await printer.home();
    } catch {
      toast.show(t('idle.homeFailed'), { tone: 'error' });
    }
  }
</script>

<div class="bottom">
  <Card title={t('idle.recent')} icon={History}>
    {#snippet actions()}
      <Button variant="ghost" icon={FolderOpen} onclick={() => nav.go('files')}>{t('idle.allFiles')}</Button>
    {/snippet}
    {#if rows.length}
      <ul class="files" data-testid="recent-files">
        {#each rows as row (row.key)}
          {@const thumb = thumbnailUrl(row.entry)}
          <li class:selected={row.selected}>
            <span class="thumb" aria-hidden="true">
              {#if thumb}<img src={thumb} alt="" />{:else}<Box size={26} strokeWidth={1.6} />{/if}
            </span>
            <span class="text">
              <span class="name">
                {#if row.selected}<span class="badge">{t('idle.selected')}</span>{/if}{row.name}
              </span>
              <span class="meta">{meta(row)}</span>
            </span>
            <Button
              variant={row.selected ? 'primary' : 'secondary'}
              icon={Play}
              disabled={!canPrint}
              onclick={() => startPrint(row.origin, row.path, row.name)}
              data-testid="print-{row.path}"
            >
              {t('job.print')}
            </Button>
          </li>
        {/each}
      </ul>
    {:else}
      <div class="empty">
        <Box size={40} strokeWidth={1.4} aria-hidden="true" />
        <p>{t('idle.noFiles')}</p>
      </div>
    {/if}
  </Card>

  <Card title={t('idle.quick')} icon={Zap}>
    <div class="quick">
      {#each presets as preset (preset.id)}
        <Button icon={Thermometer} disabled={!printer.operational} onclick={() => preheat(preset)} data-testid="preheat-{preset.id}">
          <span class="preset">{preset.name}</span>
          <span class="temps tabular">{preset.hotend}° / {preset.bed}°</span>
        </Button>
      {/each}
      <div class="pair">
        <Button icon={Snowflake} disabled={!printer.operational} onclick={cooldown} data-testid="cooldown">{t('idle.cooldown')}</Button>
        <Button icon={House} disabled={!canPrint} onclick={home} data-testid="home-axes">{t('idle.home')}</Button>
      </div>
    </div>
  </Card>
</div>

<style>
  .bottom {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: var(--sp-3);
  }
  .files {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: 72px;
    padding: var(--sp-2) var(--sp-2) var(--sp-2) var(--sp-2);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-2);
  }
  li.selected {
    border-color: var(--accent);
    background: var(--accent-soft);
  }
  .thumb {
    display: grid;
    place-items: center;
    flex: none;
    width: 56px;
    height: 56px;
    border-radius: var(--r-sm);
    background: var(--surface-3);
    color: var(--text-faint);
    overflow: hidden;
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--fs-md);
    font-weight: var(--fw-bold);
  }
  .badge {
    margin-right: var(--sp-2);
    padding: 1px 8px;
    border-radius: var(--r-pill);
    background: var(--accent);
    color: var(--on-accent);
    font-size: var(--fs-xs);
    vertical-align: 2px;
  }
  .meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .empty {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    color: var(--text-faint);
    text-align: center;
  }
  .empty p {
    margin: 0;
  }
  .quick {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }
  .quick :global(.btn) {
    justify-content: flex-start;
  }
  .quick :global(.label) {
    display: flex;
    flex: 1;
    justify-content: space-between;
    gap: var(--sp-2);
  }
  .preset {
    font-weight: var(--fw-bold);
  }
  .temps {
    color: var(--text-dim);
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-2);
  }
  .pair :global(.btn) {
    justify-content: center;
    gap: 6px;
    padding: 0 var(--sp-2);
  }
  .pair :global(.label) {
    flex: none;
  }
</style>
