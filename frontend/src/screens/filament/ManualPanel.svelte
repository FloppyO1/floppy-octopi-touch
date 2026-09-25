<script lang="ts">
  // Manual extrude/retract with length and speed; disabled below the cold extrusion limit.
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Flame from '@lucide/svelte/icons/flame';
  import Hand from '@lucide/svelte/icons/hand';
  import Snowflake from '@lucide/svelte/icons/snowflake';
  import { canExtrude, extrudeGcode, splitMove } from '../../lib/core/filament';
  import { formatTemp } from '../../lib/core/format';
  import { heaterTone } from '../../lib/core/gauge';
  import { t } from '../../lib/i18n/index.svelte';
  import { settings, temperatures, terminal } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import Card from '../../lib/ui/Card.svelte';
  import RingGauge from '../../lib/ui/RingGauge.svelte';
  import Segmented from '../../lib/ui/Segmented.svelte';
  import { toast } from '../../lib/ui/toast.svelte';
  import { askHeaterTarget } from '../heaterTarget';

  interface Props {
    locked: boolean;
  }

  let { locked }: Props = $props();

  const LENGTHS = [5, 10, 50, 100];
  const SPEEDS = [60, 150, 300];
  let length = $state(10);
  let speed = $state(150);

  const hotend = $derived(temperatures.latest.tool0);
  const minTemp = $derived(settings.value.filament.minTemp);
  const hot = $derived(canExtrude(hotend?.actual, minTemp));

  async function extrude(direction: 1 | -1) {
    if (locked || !hot) return;
    try {
      await terminal.send(extrudeGcode(splitMove(direction * length, speed)));
    } catch {
      toast.show(t('filament.failed'), { tone: 'error' });
    }
  }
</script>

<Card title={t('filament.manual')} icon={Hand} class="manual" data-testid="manual">
  <div class="heat">
    <RingGauge
      size="S"
      label={t('heater.tool0')}
      icon={Flame}
      value={hotend?.actual}
      target={hotend?.target}
      max={settings.value.temperature.max.hotend}
      unit="°"
      sublabel={hotend?.target ? formatTemp(hotend.target) : t('gauge.off')}
      tone={heaterTone(hotend?.actual, hotend?.target)}
      unavailable={!hotend}
      onclick={() => askHeaterTarget('tool0')}
      testid="manual-gauge"
    />
    <p class="state" class:cold={!hot} data-testid="manual-state">
      {#if hot}
        {t('filament.hotEnough')}
      {:else}
        <Snowflake size={18} aria-hidden="true" />{t('filament.tooCold', { value: minTemp })}
      {/if}
    </p>
  </div>
  <div class="field">
    <span class="label">{t('filament.length')}</span>
    <Segmented
      label={t('filament.length')}
      bind:value={length}
      options={LENGTHS.map((v) => ({ value: v, label: `${v} mm` }))}
      disabled={locked}
      testid="manual-length"
    />
  </div>
  <div class="field">
    <span class="label">{t('filament.speed')}</span>
    <Segmented
      label={t('filament.speed')}
      bind:value={speed}
      options={SPEEDS.map((v) => ({ value: v, label: `${v}` }))}
      disabled={locked}
      testid="manual-speed"
    />
  </div>
  <div class="buttons">
    <Button size="lg" icon={ArrowUp} disabled={locked || !hot} onclick={() => extrude(-1)} data-testid="manual-retract">
      {t('filament.retract')}
    </Button>
    <Button variant="primary" size="lg" icon={ArrowDown} disabled={locked || !hot} onclick={() => extrude(1)} data-testid="manual-extrude">
      {t('filament.extrude')}
    </Button>
  </div>
</Card>

<style>
  :global(.card.manual) {
    min-height: 0;
  }
  .heat {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }
  .state {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    color: var(--ok);
    font-size: var(--fs-sm);
  }
  .state.cold {
    color: var(--cooling);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }
  .label {
    color: var(--text-dim);
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
  }
  .field :global(.segmented .btn) {
    padding: 0 var(--sp-1);
    font-size: var(--fs-sm);
  }
  .buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-2);
    margin-top: auto;
  }
  .buttons :global(.btn) {
    padding: 0 var(--sp-2);
  }
</style>
