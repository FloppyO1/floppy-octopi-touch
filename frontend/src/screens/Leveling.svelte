<script lang="ts">
  // Leveling and mesh: paper test at the corners (no probe needed), mesh heatmap with manual (MBL) or
  // automatic (G29) probing, babystep / probe Z offset / EEPROM. Moves are locked during a job;
  // babystepping stays available.
  import Lock from '@lucide/svelte/icons/lock';
  import { t } from '../lib/i18n/index.svelte';
  import { leveling, printer } from '../lib/stores';
  import Segmented from '../lib/ui/Segmented.svelte';
  import MeshPanel from './leveling/MeshPanel.svelte';
  import PaperTest from './leveling/PaperTest.svelte';
  import { view, type LevelingTab } from './leveling/view.svelte';
  import ZPanel from './leveling/ZPanel.svelte';

  const locked = $derived(!printer.operational || printer.busy);
  const tabs = $derived<{ value: LevelingTab; label: string }[]>([
    { value: 'paper', label: t('leveling.tab.paper') },
    { value: 'mesh', label: t('leveling.tab.mesh') },
    { value: 'z', label: t('leveling.tab.z') },
  ]);

  // A running manual mesh keeps the user on its tab.
  $effect(() => {
    if (leveling.mbl) view.tab = 'mesh';
  });
</script>

<div class="leveling">
  <div class="bar">
    <div class="tabs">
      <Segmented label={t('screen.leveling')} bind:value={view.tab} options={tabs} disabled={leveling.mbl !== null} testid="leveling-tab" />
    </div>
    {#if printer.busy}
      <p class="locked" data-testid="leveling-locked"><Lock size={18} aria-hidden="true" />{t('leveling.locked')}</p>
    {/if}
  </div>

  {#if view.tab === 'paper'}
    <PaperTest {locked} />
  {:else if view.tab === 'mesh'}
    <MeshPanel {locked} />
  {:else}
    <ZPanel {locked} />
  {/if}
</div>

<style>
  .leveling {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    height: 100%;
    padding: var(--sp-3);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }
  .tabs :global(.btn) {
    min-width: 150px;
  }
  .locked {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--sp-2);
    min-height: var(--touch);
    margin: 0;
    padding: 0 var(--sp-3);
    border-radius: var(--r-md);
    background: var(--paused-soft);
    color: var(--paused);
    font-size: var(--fs-sm);
  }
</style>
