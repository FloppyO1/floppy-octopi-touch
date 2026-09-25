<script lang="ts">
  // Home: ring gauges on top, then the job view (printing, paused…) or the idle view.
  import Box from '@lucide/svelte/icons/box';
  import Fan from '@lucide/svelte/icons/fan';
  import Flame from '@lucide/svelte/icons/flame';
  import Heater from '@lucide/svelte/icons/heater';
  import Layers from '@lucide/svelte/icons/layers';
  import { formatDuration, formatTemp } from '../lib/core/format';
  import { heaterTone } from '../lib/core/gauge';
  import { t } from '../lib/i18n/index.svelte';
  import { job, printer, server, settings, temperatures, tune } from '../lib/stores';
  import Card from '../lib/ui/Card.svelte';
  import RingGauge from '../lib/ui/RingGauge.svelte';
  import { askHeaterTarget } from './heaterTarget';
  import { askFan } from './home/actions';
  import IdleView from './home/IdleView.svelte';
  import JobView from './home/JobView.svelte';
  import StatusRows from './home/StatusRows.svelte';

  const hotend = $derived(temperatures.latest.tool0);
  const bed = $derived(temperatures.latest.bed);
  const limits = $derived(settings.value.temperature.max);
  const paused = $derived(printer.phase === 'paused' || printer.phase === 'pausing');
  const targetText = (target: number | null | undefined) =>
    target ? t('gauge.target', { value: formatTemp(target) }) : t('gauge.off');
</script>

<div class="home" data-view={printer.busy ? 'job' : 'idle'}>
  <Card class="gauges">
    <RingGauge
      label={t('heater.tool0')}
      icon={Flame}
      value={hotend?.actual}
      target={hotend?.target}
      max={limits.hotend}
      unit="°"
      sublabel={targetText(hotend?.target)}
      tone={heaterTone(hotend?.actual, hotend?.target)}
      onclick={() => askHeaterTarget('tool0')}
      testid="gauge-hotend"
    />
    <RingGauge
      label={t('heater.bed')}
      icon={Heater}
      value={bed?.actual}
      target={bed?.target}
      max={limits.bed}
      unit="°"
      sublabel={targetText(bed?.target)}
      tone={heaterTone(bed?.actual, bed?.target)}
      unavailable={!bed}
      onclick={() => askHeaterTarget('bed')}
      testid="gauge-bed"
    />
    <RingGauge
      label={t('gauge.fan')}
      icon={Fan}
      value={tune.fan}
      unit="%"
      tone={tune.fan ? 'accent' : 'neutral'}
      sublabel={tune.fan === null ? t('gauge.tapToSet') : tune.fan ? t('gauge.on') : t('tune.off')}
      unavailable={tune.fan === null}
      onclick={askFan}
      testid="gauge-fan"
    />
    {#if printer.busy}
      <RingGauge
        label={t('gauge.job')}
        icon={Box}
        value={job.completion}
        unit="%"
        tone={paused ? 'paused' : 'accent'}
        sublabel={formatDuration(job.progress?.printTimeLeft)}
        unavailable={job.completion === null}
        testid="gauge-job"
      />
      {#if server.plugins.displayLayerProgress}
        <RingGauge
          label={t('gauge.layer')}
          icon={Layers}
          value={job.layer?.current}
          max={job.layer?.total ?? 100}
          tone={paused ? 'paused' : 'accent'}
          sublabel={job.layer ? t('gauge.layerOf', { total: job.layer.total }) : t('gauge.unavailable')}
          unavailable={!job.layer}
          testid="gauge-layer"
        />
      {/if}
    {:else}
      <div class="status">
        <StatusRows />
      </div>
    {/if}
  </Card>

  {#if printer.busy}
    <JobView />
  {:else}
    <IdleView />
  {/if}
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    height: 100%;
    padding: var(--sp-3);
  }
  .home :global(.gauges) {
    flex-direction: row;
    justify-content: space-around;
    align-items: center;
    padding: var(--sp-3) var(--sp-2);
  }
  .status {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    width: 300px;
    padding-left: var(--sp-4);
    border-left: 1px solid var(--border);
  }
</style>
