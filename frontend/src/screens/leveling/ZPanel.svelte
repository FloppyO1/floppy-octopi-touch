<script lang="ts">
  // Z fine tuning: babystepping (M290, also while printing), probe Z offset (M851), save to EEPROM (M500).
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Crosshair from '@lucide/svelte/icons/crosshair';
  import MoveVertical from '@lucide/svelte/icons/move-vertical';
  import { untrack } from 'svelte';
  import Pencil from '@lucide/svelte/icons/pencil';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Save from '@lucide/svelte/icons/save';
  import { formatOffset } from '../../lib/core/mesh';
  import { BABYSTEPS } from '../../lib/core/settings';
  import { t } from '../../lib/i18n/index.svelte';
  import { capabilities, leveling, printer, settings } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import Card from '../../lib/ui/Card.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import Segmented from '../../lib/ui/Segmented.svelte';
  import { babystep, readProbeOffset, saveEeprom, setProbeOffset } from './actions';

  interface Props {
    locked: boolean;
  }

  let { locked }: Props = $props();

  const canBabystep = $derived(printer.operational && capabilities.has('babystepping'));
  const probe = $derived(capabilities.has('zProbe'));
  const steps = BABYSTEPS.map((s) => ({ value: s, label: `${s} mm` }));

  // Read the probe offset when the panel opens (a value from the log history may be stale).
  $effect(() => {
    if (probe && printer.operational) untrack(() => void readProbeOffset());
  });
</script>

<div class="z-panel">
  <Card title={t('leveling.babystep')} icon={MoveVertical} class="baby">
    {#snippet actions()}
      <Segmented
        label={t('move.step')}
        value={settings.value.leveling.babystep}
        options={steps}
        onchange={(step) => settings.update((s) => (s.leveling.babystep = step))}
        testid="babystep-step"
      />
    {/snippet}
    <div class="baby-body">
      <Button class="baby-btn" icon={ArrowUp} disabled={!canBabystep} onclick={() => babystep(1)} data-testid="babystep-up">
        {t('leveling.farther')}
      </Button>
      <div class="total">
        <span class="label">{t('leveling.babystepTotal')}</span>
        <span class="value tabular" data-testid="babystep-total">{formatOffset(leveling.babystepTotal, 2)} mm</span>
      </div>
      <Button class="baby-btn" icon={ArrowDown} disabled={!canBabystep} onclick={() => babystep(-1)} data-testid="babystep-down">
        {t('leveling.closer')}
      </Button>
    </div>
    <p class="text">
      {capabilities.has('babystepping') ? t('leveling.babystepHint') : t('leveling.babystepMissing')}
    </p>
  </Card>

  <div class="side">
    {#if probe}
      <Card title={t('leveling.probeOffset')} icon={Crosshair} compact>
        {#snippet actions()}
          <IconButton icon={RefreshCw} label={t('leveling.read')} variant="ghost" disabled={!printer.operational} onclick={readProbeOffset} data-testid="probe-read" />
        {/snippet}
        <p class="offset tabular" data-testid="probe-offset">{formatOffset(leveling.probeOffsetZ, 2)} mm</p>
        <Button icon={Pencil} disabled={locked} onclick={setProbeOffset} data-testid="probe-set">{t('leveling.setOffset')}</Button>
        <p class="text">{t('leveling.probeOffsetHint')}</p>
      </Card>
    {/if}

    {#if capabilities.has('eeprom')}
      <Card title={t('leveling.eeprom')} icon={Save} compact>
        <p class="text">{t('leveling.eepromHint')}</p>
        <Button icon={Save} disabled={locked} onclick={saveEeprom} data-testid="z-save">{t('leveling.save')}</Button>
      </Card>
    {/if}
  </div>
</div>

<style>
  .z-panel {
    display: grid;
    flex: 1;
    grid-template-columns: 1fr 340px;
    gap: var(--sp-3);
    min-height: 0;
  }
  .z-panel :global(.baby .actions) {
    align-items: center;
  }
  .z-panel :global(.baby .segmented .btn) {
    min-width: 104px;
  }
  .baby-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-3);
  }
  .baby-body :global(.baby-btn) {
    width: 280px;
    min-height: 96px;
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
  }
  .baby-body :global(.baby-btn svg) {
    width: 32px;
    height: 32px;
    color: var(--accent-strong);
  }
  .total {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .label {
    color: var(--text-faint);
    font-size: var(--fs-sm);
  }
  .value {
    font-size: var(--fs-2xl);
    font-weight: var(--fw-bold);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-height: 0;
  }
  .offset {
    margin: 0;
    font-size: var(--fs-2xl);
    font-weight: var(--fw-bold);
    text-align: center;
  }
  .text {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--fs-sm);
    line-height: 1.35;
  }
</style>
