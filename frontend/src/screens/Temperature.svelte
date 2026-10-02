<script lang="ts">
  // Temperature: hotend and bed (NumPad, off), all off, live chart (5/15/30 min) and presets (CRUD).
  import ChartLine from '@lucide/svelte/icons/chart-line';
  import Fan from '@lucide/svelte/icons/fan';
  import Pencil from '@lucide/svelte/icons/pencil';
  import PowerOff from '@lucide/svelte/icons/power-off';
  import Thermometer from '@lucide/svelte/icons/thermometer';
  import { heaterColorVar } from '../lib/core/chart';
  import { CHART_WINDOWS } from '../lib/core/settings';
  import { t } from '../lib/i18n/index.svelte';
  import { printer, settings, temperatures } from '../lib/stores';
  import Button from '../lib/ui/Button.svelte';
  import Card from '../lib/ui/Card.svelte';
  import Segmented from '../lib/ui/Segmented.svelte';
  import { allHeatersOff, preheat } from './heaterTarget';
  import HeaterCard from './temperature/HeaterCard.svelte';
  import PresetManager from './temperature/PresetManager.svelte';
  // uPlot (~22 KB gzip) is only needed here: loaded with the screen, not at startup.
  const chart = import('./temperature/TempChart.svelte');

  let managing = $state(false);
  const windows = $derived(CHART_WINDOWS.map((m) => ({ value: m, label: t('temps.minutes', { value: m }) })));
  const anyTarget = $derived(temperatures.heaters.some((h) => temperatures.latest[h]?.target));
</script>

<div class="temperature">
  <div class="heaters">
    <HeaterCard heater="tool0" />
    <HeaterCard heater="bed" />
    <Button icon={PowerOff} size="lg" disabled={!printer.operational || !anyTarget} onclick={allHeatersOff} data-testid="all-off">
      {t('temps.allOff')}
    </Button>
  </div>

  <div class="main">
    <Card title={t('temps.chart')} icon={ChartLine} class="chart-card">
      {#snippet actions()}
        <Segmented
          label={t('temps.window')}
          value={settings.value.temperature.chartMinutes}
          options={windows}
          onchange={(m) => settings.update((s) => (s.temperature.chartMinutes = m))}
          testid="chart-window"
        />
      {/snippet}
      {#await chart}
        <div class="chart-wait"></div>
      {:then { default: TempChart }}
        <TempChart minutes={settings.value.temperature.chartMinutes} />
      {/await}
      <span class="legend" aria-hidden="true">
        {#each temperatures.heaters as heater (heater)}
          <span class="key" style:--key="var({heaterColorVar(heater)})">{t(`heater.${heater}`)}</span>
        {/each}
        <span class="key target">{t('temps.targetLegend')}</span>
      </span>
    </Card>

    <Card title={t('presets.title')} icon={Thermometer} compact>
      {#snippet actions()}
        <Button variant="ghost" icon={Pencil} onclick={() => (managing = true)} data-testid="presets-manage">{t('presets.manage')}</Button>
      {/snippet}
      <div class="presets" data-testid="temp-presets">
        {#each settings.value.presets as preset (preset.id)}
          <Button
            disabled={!printer.operational || printer.busy}
            onclick={() => preheat(preset)}
            data-testid="temp-preset-{preset.id}"
          >
            <span class="preset-name">{preset.name}</span>
            <span class="preset-temps tabular">
              {preset.hotend}° / {preset.bed}°{#if preset.fan !== null}<Fan size={14} aria-hidden="true" />{preset.fan}%{/if}
            </span>
          </Button>
        {:else}
          <p class="none">{t('presets.empty')}</p>
        {/each}
      </div>
    </Card>
  </div>
</div>

{#if managing}
  <PresetManager onclose={() => (managing = false)} />
{/if}

<style>
  .chart-wait {
    flex: 1;
  }
  .temperature {
    display: grid;
    grid-template-columns: 330px 1fr;
    gap: var(--sp-3);
    height: 100%;
    padding: var(--sp-3);
  }
  .heaters,
  .main {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-height: 0;
    min-width: 0;
  }
  .heaters :global(.card) {
    flex: 1;
  }
  .main :global(.chart-card) {
    flex: 1;
    min-height: 0;
  }
  .main :global(.chart-card .actions) {
    align-items: center;
  }
  .main :global(.chart-card .segmented .btn) {
    flex: none;
    min-width: 72px;
    padding: 0 var(--sp-2);
  }
  .legend {
    display: flex;
    gap: var(--sp-3);
    justify-content: center;
    margin-top: calc(-1 * var(--sp-2));
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .key {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .key::before {
    content: '';
    width: 16px;
    height: 3px;
    border-radius: 2px;
    background: var(--key);
  }
  .key.target::before {
    height: 0;
    border-top: 2px dashed var(--text-dim);
    background: none;
  }
  .presets {
    display: flex;
    gap: var(--sp-2);
    overflow-x: auto;
    overscroll-behavior: contain;
  }
  .presets :global(.btn) {
    flex: 0 0 auto;
    min-width: 132px;
    min-height: 64px;
  }
  .presets :global(.label) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
  .preset-name {
    font-weight: var(--fw-bold);
  }
  .preset-temps {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .none {
    margin: 0;
    color: var(--text-faint);
  }
</style>
