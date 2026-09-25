<script lang="ts">
  // Files: OctoPrint local storage (folders, search, sort, grid/list), the printer's SD card and the
  // Pi's USB stick (import into local storage).
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Box from '@lucide/svelte/icons/box';
  import CardSim from '@lucide/svelte/icons/card-sim';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import CornerLeftUp from '@lucide/svelte/icons/corner-left-up';
  import Eject from '@lucide/svelte/icons/eject';
  import HardDrive from '@lucide/svelte/icons/hard-drive';
  import LayoutGrid from '@lucide/svelte/icons/layout-grid';
  import List from '@lucide/svelte/icons/list';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Search from '@lucide/svelte/icons/search';
  import SearchX from '@lucide/svelte/icons/search-x';
  import Usb from '@lucide/svelte/icons/usb';
  import X from '@lucide/svelte/icons/x';
  import type { UsbFile } from '../lib/api/types';
  import {
    breadcrumbs,
    flattenFiles,
    folderChildren,
    matchesQuery,
    parentPath,
    sdAvailable,
    searchFiles,
    SORT_KEYS,
    type SortKey,
  } from '../lib/core/files';
  import { formatBytes } from '../lib/core/format';
  import { t } from '../lib/i18n/index.svelte';
  import { capabilities, files, printer, server, settings, usb } from '../lib/stores';
  import Button from '../lib/ui/Button.svelte';
  import { dialogs } from '../lib/ui/dialogs.svelte';
  import IconButton from '../lib/ui/IconButton.svelte';
  import Spinner from '../lib/ui/Spinner.svelte';
  import type { IconComponent } from '../lib/ui/types';
  import { ejectStick, importFromUsb, sdCommand } from './files/actions';
  import FileDetail from './files/FileDetail.svelte';
  import FileGrid from './files/FileGrid.svelte';
  import ImportProgress from './files/ImportProgress.svelte';
  import { entryItem, sortItems, usbItem, type Item } from './files/items';
  import UsbDetail from './files/UsbDetail.svelte';
  import { view, type Source } from './files/view.svelte';

  const prefs = $derived(settings.value.files);
  const showSd = $derived(
    sdAvailable(server.sdSupport, capabilities.report.caps.SDCARD, settings.value.capabilities.overrides.sdCard),
  );
  const sources = $derived<{ id: Source; icon: IconComponent }[]>([
    { id: 'local', icon: HardDrive },
    ...(showSd ? [{ id: 'sdcard' as const, icon: CardSim }] : []),
    { id: 'usb', icon: Usb },
  ]);
  $effect(() => {
    if (view.source === 'sdcard' && !showSd) view.show('local');
  });

  const busy = $derived(new Set(printer.busyFiles.map((f) => `${f.origin}:${f.path}`)));
  // The open folder may have been deleted meanwhile: fall back to the root.
  const children = $derived(folderChildren(files.local, view.folder));
  $effect(() => {
    if (files.status === 'ready' && children === null) view.open('');
  });

  const items = $derived.by<Item[]>(() => {
    const query = view.query;
    let list: Item[];
    if (view.source === 'local') {
      list = query
        ? searchFiles(files.local, query).map((e) => entryItem(e, busy, true))
        : (children ?? []).map((e) => entryItem(e, busy));
    } else if (view.source === 'sdcard') {
      list = flattenFiles(files.sdcard)
        .filter((e) => !query || matchesQuery(e.path, query))
        .map((e) => entryItem(e, busy));
    } else {
      list = usb.files.filter((f) => !query || matchesQuery(f.path, query)).map((f) => usbItem(f, usb.mounts.length > 1));
    }
    return sortItems(list, prefs.sort, prefs.direction);
  });

  const loading = $derived(
    view.source === 'usb' ? usb.status === 'loading' && !usb.files.length : files.status === 'loading' && !files.local.length,
  );
  const failed = $derived(view.source === 'usb' ? usb.status === 'error' : files.status === 'error');
  const sdLocked = $derived(!printer.operational || printer.busy);

  const usbFile = $derived.by<UsbFile | null>(() => {
    const d = view.detail;
    return d?.kind === 'usb' ? (usb.files.find((f) => f.mount === d.mount && f.path === d.path) ?? null) : null;
  });
  // Stick removed while its file was open.
  $effect(() => {
    if (view.detail?.kind === 'usb' && !usbFile) view.detail = null;
  });

  function open(item: Item) {
    if ('folder' in item.target) view.open(item.target.folder);
    else view.detail = item.target;
  }

  function sortBy(key: SortKey) {
    settings.update((s) => {
      if (s.files.sort === key) s.files.direction = s.files.direction === 'asc' ? 'desc' : 'asc';
      else {
        s.files.sort = key;
        s.files.direction = key === 'name' ? 'asc' : 'desc';
      }
    });
  }

  async function search() {
    const query = await dialogs.text({ title: t('files.search'), value: view.query, placeholder: t('files.search') });
    if (query !== null) view.query = query.trim();
  }

  function refresh() {
    if (view.source === 'usb') void usb.refresh();
    else void files.refresh();
  }

  async function importFile(file: UsbFile, folder: string) {
    view.detail = null;
    const result = await importFromUsb(file, folder);
    if (!result) return;
    view.show('local');
    view.open(parentPath(result.path));
    view.detail = { kind: 'entry', origin: 'local', path: result.path };
  }

  const emptyText = $derived.by(() => {
    if (view.query) return t('files.noResults', { query: view.query });
    if (view.source === 'sdcard') return printer.sdReady ? t('files.sdEmpty') : t('files.sdNotReady');
    if (view.source === 'usb') return usb.mounts.length ? t('files.usbEmpty') : t('files.usbNone');
    return t('files.empty');
  });
</script>

<div class="files">
  <div class="bar">
    <div class="tabs" role="tablist" aria-label={t('screen.files')}>
      {#each sources as source (source.id)}
        <Button
          role="tab"
          aria-selected={view.source === source.id}
          selected={view.source === source.id}
          icon={source.icon}
          onclick={() => view.show(source.id)}
          data-testid="source-{source.id}"
        >
          {t(`files.${source.id}`)}
          {#if source.id === 'usb' && usb.mounts.length}<span class="dot" aria-hidden="true"></span>{/if}
        </Button>
      {/each}
    </div>
    <span class="spacer"></span>
    {#if view.source === 'local' && files.free !== null}
      <span class="free tabular">{t('files.free', { free: formatBytes(files.free) })}</span>
    {/if}
    <IconButton icon={Search} label={t('files.search')} selected={!!view.query} onclick={search} data-testid="files-search" />
    <IconButton
      icon={prefs.view === 'grid' ? List : LayoutGrid}
      label={t(prefs.view === 'grid' ? 'files.viewList' : 'files.viewGrid')}
      onclick={() => settings.update((s) => (s.files.view = s.files.view === 'grid' ? 'list' : 'grid'))}
      data-testid="files-view"
    />
    <IconButton icon={RefreshCw} label={t('files.refresh')} onclick={refresh} data-testid="files-refresh" />
  </div>

  <div class="bar">
    {#if view.query}
      <span class="chip" data-testid="search-chip">
        <Search size={18} aria-hidden="true" />
        {t('files.searchResults', { count: items.length, query: view.query })}
      </span>
      <IconButton icon={X} label={t('files.clearSearch')} variant="ghost" onclick={() => (view.query = '')} data-testid="search-clear" />
    {:else if view.source === 'local'}
      <IconButton icon={CornerLeftUp} label={t('files.up')} disabled={!view.folder} onclick={() => view.open(parentPath(view.folder))} data-testid="folder-up" />
      <nav class="crumbs" aria-label={t('files.folder')} data-testid="breadcrumb">
        <Button variant="ghost" selected={!view.folder} onclick={() => view.open('')}>{t('files.root')}</Button>
        {#each breadcrumbs(view.folder) as crumb (crumb.path)}
          <ChevronRight size={18} aria-hidden="true" />
          <Button variant="ghost" selected={crumb.path === view.folder} onclick={() => view.open(crumb.path)}>{crumb.name}</Button>
        {/each}
      </nav>
    {:else if view.source === 'sdcard'}
      {#if printer.sdReady}
        <Button icon={RefreshCw} disabled={sdLocked} onclick={() => sdCommand(files.refreshSd)} data-testid="sd-refresh">{t('files.sdRefresh')}</Button>
        <Button icon={Eject} disabled={sdLocked} onclick={() => sdCommand(files.releaseSd)} data-testid="sd-release">{t('files.sdRelease')}</Button>
      {:else}
        <Button variant="primary" icon={CardSim} disabled={sdLocked} onclick={() => sdCommand(files.initSd)} data-testid="sd-init">{t('files.sdInit')}</Button>
      {/if}
    {:else}
      {#each usb.mounts as mount (mount.id)}
        <span class="chip"><Usb size={18} aria-hidden="true" />{mount.name}</span>
        <Button icon={Eject} disabled={usb.importing !== null} onclick={() => ejectStick(mount.id)} data-testid="usb-eject-{mount.id}">{t('files.eject')}</Button>
      {/each}
    {/if}
    <span class="spacer"></span>
    <div class="sort" role="group" aria-label={t('files.sortBy')}>
      {#each SORT_KEYS as key (key)}
        {@const active = prefs.sort === key}
        <Button
          variant="ghost"
          selected={active}
          icon={active ? (prefs.direction === 'asc' ? ArrowUp : ArrowDown) : undefined}
          aria-label="{t('files.sortBy')} {t(`files.sort.${key}`)}{active ? `, ${t(prefs.direction === 'asc' ? 'files.ascending' : 'files.descending')}` : ''}"
          onclick={() => sortBy(key)}
          data-testid="sort-{key}"
        >
          {t(`files.sort.${key}`)}
        </Button>
      {/each}
    </div>
  </div>

  <div class="content" data-testid="files-content">
    {#if loading}
      <div class="empty"><Spinner /><p>{t('files.loading')}</p></div>
    {:else if failed}
      <div class="empty"><p>{t('files.loadError')}</p></div>
    {:else if items.length}
      <FileGrid {items} mode={prefs.view} onopen={open} />
    {:else}
      {@const EmptyIcon = view.query ? SearchX : view.source === 'usb' ? Usb : view.source === 'sdcard' ? CardSim : Box}
      <div class="empty" data-testid="files-empty">
        <EmptyIcon size={48} strokeWidth={1.4} aria-hidden="true" />
        <p>{emptyText}</p>
      </div>
    {/if}
    {#if view.source === 'sdcard' && !view.query}
      <p class="hint">{sdLocked && printer.busy ? t('files.sdPrinting') : t('files.sdHint')}</p>
    {:else if view.source === 'usb' && usb.mounts.length && !view.query}
      <p class="hint">{t('files.usbHint')}</p>
    {/if}
  </div>
</div>

{#if view.detail?.kind === 'entry'}
  {#key view.detail}
    <FileDetail origin={view.detail.origin} path={view.detail.path} onclose={() => (view.detail = null)} />
  {/key}
{:else if usbFile}
  <UsbDetail
    file={usbFile}
    folder={view.folder}
    onimport={(folder) => importFile(usbFile, folder)}
    onclose={() => (view.detail = null)}
  />
{/if}
{#if usb.importing}
  <ImportProgress progress={usb.importing} />
{/if}

<style>
  .files {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    height: 100%;
    padding: var(--sp-3);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-height: var(--touch);
    min-width: 0;
  }
  .tabs,
  .sort {
    display: flex;
    gap: var(--sp-2);
  }
  .sort {
    flex: none;
    gap: 2px;
  }
  .sort :global(.btn) {
    padding: 0 var(--sp-3);
    gap: 4px;
  }
  .spacer {
    flex: 1;
  }
  .dot {
    display: inline-block;
    width: 10px;
    height: 10px;
    margin-left: var(--sp-2);
    border-radius: 50%;
    background: var(--ok);
    vertical-align: 1px;
  }
  .free {
    margin-right: var(--sp-2);
    color: var(--text-faint);
    font-size: var(--fs-sm);
  }
  .crumbs {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    overflow: hidden;
    color: var(--text-faint);
  }
  .crumbs :global(.btn) {
    flex: 0 1 auto;
    min-width: 0;
    padding: 0 var(--sp-3);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--sp-2);
    min-width: 0;
    padding: 0 var(--sp-2);
    color: var(--text-dim);
    font-size: var(--fs-md);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .empty {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-3);
    color: var(--text-faint);
    font-size: var(--fs-lg);
    text-align: center;
  }
  .empty p {
    margin: 0;
    max-width: 520px;
  }
  .hint {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--fs-sm);
    text-align: center;
  }
</style>
