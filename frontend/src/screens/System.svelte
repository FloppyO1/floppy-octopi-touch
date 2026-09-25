<script lang="ts">
  // System: host metrics, network, system commands and power/lights (overview), the dashboard
  // settings, and the About page.
  import { t } from '../lib/i18n/index.svelte';
  import Segmented from '../lib/ui/Segmented.svelte';
  import About from './system/About.svelte';
  import Overview from './system/Overview.svelte';
  import SettingsPanel from './system/SettingsPanel.svelte';
  import { view, type SystemTab } from './system/view.svelte';

  const tabs = $derived<{ value: SystemTab; label: string }[]>([
    { value: 'overview', label: t('system.tab.overview') },
    { value: 'settings', label: t('settings.title') },
    { value: 'about', label: t('system.about') },
  ]);
</script>

<div class="system">
  <div class="tabs">
    <Segmented label={t('screen.system')} bind:value={view.tab} options={tabs} testid="system-tab" />
  </div>
  {#if view.tab === 'overview'}
    <Overview />
  {:else if view.tab === 'settings'}
    <SettingsPanel />
  {:else}
    <About />
  {/if}
</div>

<style>
  .system {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    height: 100%;
    padding: var(--sp-3);
  }
  .tabs :global(.btn) {
    min-width: 150px;
  }
</style>
