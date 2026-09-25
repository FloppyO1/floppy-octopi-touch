<script lang="ts">
  // One heater: ring gauge (tap = NumPad with presets), target and an Off button.
  import Flame from '@lucide/svelte/icons/flame';
  import Heater from '@lucide/svelte/icons/heater';
  import Hash from '@lucide/svelte/icons/hash';
  import Power from '@lucide/svelte/icons/power';
  import { formatTemp } from '../../lib/core/format';
  import { heaterTone } from '../../lib/core/gauge';
  import { t } from '../../lib/i18n/index.svelte';
  import { printer, settings, temperatures } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import Card from '../../lib/ui/Card.svelte';
  import RingGauge from '../../lib/ui/RingGauge.svelte';
  import { askHeaterTarget, heaterOff } from '../heaterTarget';

  interface Props {
    heater: 'tool0' | 'bed';
  }

  let { heater }: Props = $props();

  const reading = $derived(temperatures.latest[heater]);
  const max = $derived(heater === 'bed' ? settings.value.temperature.max.bed : settings.value.temperature.max.hotend);
  const tone = $derived(heaterTone(reading?.actual, reading?.target));
  const status = $derived.by(() => {
    if (!reading?.target) return t('temps.stateOff');
    if (tone === 'heating') return t('temps.stateHeating');
    if (tone === 'cooling') return t('temps.stateCooling');
    return t('temps.stateReady');
  });
</script>

<Card class="heater" compact data-testid="heater-{heater}">
  <RingGauge
    label={t(`heater.${heater}`)}
    icon={heater === 'bed' ? Heater : Flame}
    value={reading?.actual}
    target={reading?.target}
    {max}
    unit="°"
    decimals={0}
    sublabel={reading?.target ? t('gauge.target', { value: formatTemp(reading.target) }) : t('gauge.off')}
    {tone}
    unavailable={!reading}
    onclick={() => askHeaterTarget(heater)}
    testid="temp-gauge-{heater}"
  />
  <div class="side">
    <span class="state tone-{reading?.target ? tone : 'neutral'}">{status}</span>
    <span class="actual tabular">{formatTemp(reading?.actual, 1)}</span>
    <Button icon={Hash} disabled={!printer.operational} onclick={() => askHeaterTarget(heater)} data-testid="set-{heater}">
      {t('temps.set')}
    </Button>
    <Button
      icon={Power}
      disabled={!printer.operational || !reading?.target}
      onclick={() => heaterOff(heater)}
      data-testid="off-{heater}"
    >
      {t('temps.turnOff')}
    </Button>
  </div>
</Card>

<style>
  :global(.card.heater) {
    flex-direction: row;
    align-items: center;
    gap: var(--sp-3);
  }
  .side {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--sp-2);
    min-width: 0;
  }
  .state {
    color: var(--text-dim);
    font-size: var(--fs-sm);
    font-weight: var(--fw-bold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .tone-heating {
    color: var(--heating);
  }
  .tone-cooling {
    color: var(--cooling);
  }
  .tone-ok {
    color: var(--ok);
  }
  .actual {
    color: var(--text-dim);
    font-size: var(--fs-md);
  }
</style>
