<script lang="ts">
  // Files and folders as a thumbnail grid or a compact list; a tap opens the folder or the detail.
  import Box from '@lucide/svelte/icons/box';
  import ChevronRight from '@lucide/svelte/icons/chevron-right';
  import Folder from '@lucide/svelte/icons/folder';
  import Printer from '@lucide/svelte/icons/printer';
  import { formatBytes, formatDuration, formatFileDate } from '../../lib/core/format';
  import type { FileView } from '../../lib/core/settings';
  import { i18n, t } from '../../lib/i18n/index.svelte';
  import { settings } from '../../lib/stores';
  import { pressable } from '../../lib/ui/press';
  import Thumb from '../../lib/ui/Thumb.svelte';
  import type { Item } from './items';

  interface Props {
    items: Item[];
    mode: FileView;
    onopen: (item: Item) => void;
  }

  let { items, mode, onopen }: Props = $props();

  function meta(item: Item): string {
    if (item.folder) return item.count === 1 ? t('files.item') : t('files.items', { count: item.count });
    const parts = [item.estimate ? `≈ ${formatDuration(item.estimate)}` : null, formatBytes(item.size)];
    return parts.filter(Boolean).join(' · ');
  }
</script>

<ul class={mode} data-testid="file-{mode}">
  {#each items as item (item.key)}
    <li>
      <button
        type="button"
        class="item"
        class:folder={item.folder}
        onclick={() => onopen(item)}
        data-testid="item-{item.name}"
        {@attach pressable}
      >
        <span class="img">
          <Thumb src={item.thumb} icon={item.folder ? Folder : Box} iconSize={mode === 'grid' ? 44 : 26} />
          {#if item.busy}<span class="busy" title={t('files.busy')}><Printer size={16} aria-hidden="true" /></span>{/if}
        </span>
        <span class="text">
          <span class="name">{item.name}</span>
          {#if item.location}<span class="location">{item.location}</span>{/if}
          <span class="meta tabular">{meta(item)}</span>
        </span>
        {#if mode === 'list'}
          <span class="date tabular">{item.folder ? '' : formatFileDate(item.date, i18n.locale, !settings.value.clock24h)}</span>
          <ChevronRight size={22} aria-hidden="true" />
        {/if}
      </button>
    </li>
  {/each}
</ul>

<style>
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--sp-3);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
  }
  .item {
    display: flex;
    width: 100%;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    color: var(--text);
    text-align: left;
    transition: transform var(--dur-fast) var(--ease), background-color var(--dur) var(--ease);
  }
  .item:global([data-pressed]) {
    transform: scale(0.97);
    background: var(--surface-2);
  }
  .grid .item {
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }
  .list .item {
    align-items: center;
    gap: var(--sp-3);
    min-height: 64px;
    padding: var(--sp-1) var(--sp-3) var(--sp-1) var(--sp-1);
  }
  .img {
    position: relative;
    flex: none;
  }
  .grid .img {
    height: 120px;
    border-radius: var(--r-md) var(--r-md) 0 0;
  }
  .list .img {
    width: 54px;
    height: 54px;
    border-radius: var(--r-sm);
  }
  .folder .img :global(.thumb) {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .busy {
    position: absolute;
    top: 6px;
    right: 6px;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .grid .text {
    padding: var(--sp-2) var(--sp-3) var(--sp-3);
  }
  .name {
    font-size: var(--fs-md);
    font-weight: var(--fw-medium);
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .grid .name {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    min-height: 2.5em;
  }
  .list .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .location,
  .meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .location {
    color: var(--text-faint);
  }
  .date {
    flex: none;
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .list .item :global(svg:last-child) {
    flex: none;
    color: var(--text-faint);
  }
</style>
