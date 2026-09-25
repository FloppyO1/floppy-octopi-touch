<script lang="ts">
  // Terminal and macros: live G-code console (filters, pause, history, quick commands) and the macro
  // buttons with their editor.
  import Eraser from '@lucide/svelte/icons/eraser';
  import ListFilter from '@lucide/svelte/icons/list-filter';
  import Pause from '@lucide/svelte/icons/pause';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Play from '@lucide/svelte/icons/play';
  import { TERMINAL_FILTERS } from '../lib/core/terminal';
  import { t } from '../lib/i18n/index.svelte';
  import { settings, terminal } from '../lib/stores';
  import Button from '../lib/ui/Button.svelte';
  import IconButton from '../lib/ui/IconButton.svelte';
  import Modal from '../lib/ui/Modal.svelte';
  import Segmented from '../lib/ui/Segmented.svelte';
  import Toggle from '../lib/ui/Toggle.svelte';
  import Console from './terminal/Console.svelte';
  import MacroGrid from './terminal/MacroGrid.svelte';
  import MacroManager from './terminal/MacroManager.svelte';
  import { view, type TerminalTab } from './terminal/view.svelte';

  let filtersOpen = $state(false);
  let managing = $state(false);

  const tabs = $derived<{ value: TerminalTab; label: string }[]>([
    { value: 'console', label: t('terminal.console') },
    { value: 'macros', label: t('macros.title') },
  ]);
  const filters = $derived(settings.value.terminal.filters);
  const hidden = $derived(TERMINAL_FILTERS.filter((f) => filters[f]).length);

  function togglePause() {
    view.pausedAt = view.pausedAt === null ? (terminal.lines.at(-1)?.id ?? 0) : null;
  }
</script>

<div class="terminal">
  <div class="bar">
    <div class="tabs">
      <Segmented label={t('screen.terminal')} bind:value={view.tab} options={tabs} testid="terminal-tab" />
    </div>
    <span class="spacer"></span>
    {#if view.tab === 'console'}
      <Button icon={ListFilter} onclick={() => (filtersOpen = true)} data-testid="terminal-filters">
        {hidden ? t('terminal.filtersCount', { count: hidden }) : t('terminal.filters')}
      </Button>
      <IconButton
        icon={view.pausedAt === null ? Pause : Play}
        label={t(view.pausedAt === null ? 'terminal.pause' : 'terminal.resume')}
        selected={view.pausedAt !== null}
        onclick={togglePause}
        data-testid="terminal-pause"
      />
      <IconButton icon={Eraser} label={t('terminal.clear')} onclick={() => terminal.clear()} data-testid="terminal-clear" />
    {:else}
      <Button icon={Pencil} onclick={() => (managing = true)} data-testid="macros-manage">{t('presets.manage')}</Button>
    {/if}
  </div>

  {#if view.tab === 'console'}
    <Console />
  {:else}
    <MacroGrid />
  {/if}
</div>

{#if filtersOpen}
  <Modal title={t('terminal.filters')} icon={ListFilter} tone="accent" onclose={() => (filtersOpen = false)} width={560} testid="terminal-filter-dialog">
    <p class="intro">{t('terminal.filtersIntro')}</p>
    {#each TERMINAL_FILTERS as filter (filter)}
      <div data-testid="filter-{filter}">
        <Toggle
          label={t(`terminal.filter.${filter}`)}
          hint={t(`terminal.filterHint.${filter}`)}
          checked={filters[filter]}
          onchange={(on) => settings.update((s) => (s.terminal.filters[filter] = on))}
        />
      </div>
    {/each}
  </Modal>
{/if}

{#if managing}
  <MacroManager onclose={() => (managing = false)} />
{/if}

<style>
  .terminal {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    height: 100%;
    padding: var(--sp-3);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .tabs :global(.btn) {
    min-width: 150px;
  }
  .spacer {
    flex: 1;
  }
  .intro {
    margin: 0 0 var(--sp-2);
    font-size: var(--fs-md);
  }
</style>
