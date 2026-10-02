<script lang="ts">
  // Two levels: the regions, then the cities of one region (searchable with the on-screen keyboard).
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Check from '@lucide/svelte/icons/check';
  import Globe from '@lucide/svelte/icons/globe';
  import Search from '@lucide/svelte/icons/search';
  import X from '@lucide/svelte/icons/x';
  import { onMount } from 'svelte';
  import { filterZones, groupZones, splitZone } from '../../../lib/core/timezone';
  import { t } from '../../../lib/i18n/index.svelte';
  import Button from '../../../lib/ui/Button.svelte';
  import { dialogs } from '../../../lib/ui/dialogs.svelte';
  import IconButton from '../../../lib/ui/IconButton.svelte';
  import Modal from '../../../lib/ui/Modal.svelte';
  import { pressable } from '../../../lib/ui/press';

  interface Props {
    zones: readonly string[];
    current: string;
    onselect: (zone: string) => void;
    onclose: () => void;
  }

  let { zones, current, onselect, onclose }: Props = $props();

  const groups = $derived(groupZones(zones));
  // Opens on the region of the current zone: most changes stay in the same region.
  let region = $state<string | null>(null);
  let query = $state('');
  onMount(() => {
    const start = splitZone(current).region;
    if (groups.has(start)) region = start;
  });
  const cities = $derived(region ? filterZones(groups.get(region) ?? [], query) : []);

  function regionLabel(name: string): string {
    const key = `region.${name}`;
    const label = t(key);
    return label === key ? name : label;
  }

  function openRegion(name: string | null) {
    region = name;
    query = '';
  }

  async function search() {
    const next = await dialogs.text({ title: t('datetime.search'), value: query, maxLength: 40 });
    if (next !== null) query = next.trim();
  }
</script>

<Modal title={t('datetime.zone')} icon={Globe} width={760} testid="timezone-picker" {onclose}>
  {#if region === null}
    <div class="grid regions" role="list">
      {#each [...groups.keys()] as name (name)}
        <button type="button" class="item" class:selected={splitZone(current).region === name} onclick={() => openRegion(name)} data-testid="tz-region-{name}" {@attach pressable}>
          <span>{regionLabel(name)}</span>
          <span class="count">{groups.get(name)?.length}</span>
        </button>
      {/each}
    </div>
  {:else}
    <div class="bar">
      <Button icon={ArrowLeft} onclick={() => openRegion(null)} data-testid="tz-back">{t('datetime.regions')}</Button>
      <strong class="region">{regionLabel(region)}</strong>
      <Button icon={Search} selected={query !== ''} onclick={search} data-testid="tz-search">
        {query ? t('datetime.searchAgain', { query }) : t('datetime.search')}
      </Button>
      {#if query}
        <IconButton icon={X} label={t('common.clear')} onclick={() => (query = '')} data-testid="tz-clear" />
      {/if}
    </div>
    {#if cities.length}
      <div class="grid cities" role="listbox" aria-label={regionLabel(region)}>
        {#each cities as city (city.zone)}
          <button
            type="button"
            role="option"
            aria-selected={city.zone === current}
            class="item"
            class:selected={city.zone === current}
            onclick={() => onselect(city.zone)}
            data-testid="tz-zone-{city.zone}"
            {@attach pressable}
          >
            <span>{city.label}</span>
            {#if city.zone === current}<Check size={20} aria-hidden="true" />{/if}
          </button>
        {/each}
      </div>
    {:else}
      <p class="empty">{t('datetime.noMatch', { query })}</p>
    {/if}
  {/if}
</Modal>

<style>
  .grid {
    display: grid;
    gap: var(--sp-2);
  }
  .regions {
    grid-template-columns: repeat(3, 1fr);
  }
  .cities {
    grid-template-columns: repeat(3, 1fr);
    max-height: 330px;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-2);
    min-height: var(--touch);
    padding: 0 var(--sp-3);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-2);
    color: var(--text);
    font-size: var(--fs-md);
    text-align: left;
  }
  .item span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item:global([data-pressed]) {
    border-color: var(--accent);
  }
  .selected {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: var(--fw-medium);
  }
  .count {
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin-bottom: var(--sp-3);
  }
  .region {
    flex: 1;
    color: var(--text);
    font-size: var(--fs-lg);
  }
  .empty {
    margin: var(--sp-4) 0;
    text-align: center;
  }
</style>
