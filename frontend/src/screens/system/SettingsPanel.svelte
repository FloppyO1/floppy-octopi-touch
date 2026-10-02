<script lang="ts">
  // Settings: sections on the left, the chosen one on the right (scrolls). Every change is saved
  // by the settings store (debounced), no Save button.
  import Cable from '@lucide/svelte/icons/cable';
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import Cpu from '@lucide/svelte/icons/cpu';
  import MonitorCog from '@lucide/svelte/icons/monitor-cog';
  import Move from '@lucide/svelte/icons/move';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import Thermometer from '@lucide/svelte/icons/thermometer';
  import Zap from '@lucide/svelte/icons/zap';
  import type { Component } from 'svelte';
  import { t } from '../../lib/i18n/index.svelte';
  import { pressable } from '../../lib/ui/press';
  import type { IconComponent } from '../../lib/ui/types';
  import ConnectionSection from './settings/ConnectionSection.svelte';
  import DateTimeSection from './settings/DateTimeSection.svelte';
  import DisplaySection from './settings/DisplaySection.svelte';
  import FirmwareSection from './settings/FirmwareSection.svelte';
  import GeneralSection from './settings/GeneralSection.svelte';
  import MotionSection from './settings/MotionSection.svelte';
  import PowerSection from './settings/PowerSection.svelte';
  import TemperatureSection from './settings/TemperatureSection.svelte';
  import { SETTINGS_SECTIONS, view, type SettingsSection } from './view.svelte';

  const SECTIONS: Record<SettingsSection, { icon: IconComponent; component: Component }> = {
    general: { icon: SlidersHorizontal, component: GeneralSection },
    datetime: { icon: CalendarClock, component: DateTimeSection },
    display: { icon: MonitorCog, component: DisplaySection },
    temperature: { icon: Thermometer, component: TemperatureSection },
    motion: { icon: Move, component: MotionSection },
    firmware: { icon: Cpu, component: FirmwareSection },
    power: { icon: Zap, component: PowerSection },
    connection: { icon: Cable, component: ConnectionSection },
  };

  const Current = $derived(SECTIONS[view.section].component);
</script>

<div class="settings">
  <nav aria-label={t('settings.title')}>
    {#each SETTINGS_SECTIONS as section (section)}
      {@const Icon = SECTIONS[section].icon}
      <button
        type="button"
        class:active={view.section === section}
        aria-current={view.section === section ? 'page' : undefined}
        onclick={() => (view.section = section)}
        data-testid="settings-{section}"
        {@attach pressable}
      >
        <Icon size={20} strokeWidth={2.2} aria-hidden="true" />
        <span>{t(`settings.section.${section}`)}</span>
      </button>
    {/each}
  </nav>
  <div class="panel" data-testid="settings-panel-{view.section}">
    {#key view.section}
      <Current />
    {/key}
  </div>
</div>

<style>
  .settings {
    display: grid;
    grid-template-columns: 208px 1fr;
    gap: var(--sp-3);
    flex: 1;
    min-height: 0;
  }
  nav {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }
  nav button {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: var(--touch);
    padding: 0 var(--sp-3);
    border: 1px solid transparent;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    font-size: var(--fs-md);
    font-weight: var(--fw-medium);
    text-align: left;
  }
  nav button.active {
    border-color: var(--border);
    background: var(--surface);
    color: var(--text);
  }
  nav button.active :global(svg) {
    color: var(--accent);
  }
  nav button:global([data-pressed]) {
    background: var(--surface-2);
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-height: 0;
    padding-right: var(--sp-1);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
</style>
