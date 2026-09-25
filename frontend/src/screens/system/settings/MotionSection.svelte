<script lang="ts">
  // Jog speeds, paper test geometry and the extruder setup (same dialog as the Filament screen).
  import Grid3x3 from '@lucide/svelte/icons/grid-3x3';
  import Move from '@lucide/svelte/icons/move';
  import Settings2 from '@lucide/svelte/icons/settings-2';
  import Spool from '@lucide/svelte/icons/spool';
  import { t } from '../../../lib/i18n/index.svelte';
  import { settings } from '../../../lib/stores';
  import Button from '../../../lib/ui/Button.svelte';
  import Card from '../../../lib/ui/Card.svelte';
  import InputField from '../../../lib/ui/InputField.svelte';
  import FilamentSetup from '../../filament/FilamentSetup.svelte';

  let setup = $state(false);
  const s = $derived(settings.value);
  const extruder = $derived(
    [
      t(`extruder.${s.filament.extruderType}`),
      s.filament.extruderType === 'bowden' ? t('filament.summaryBowden', { value: s.filament.bowdenLength }) : null,
      t('filament.summaryLoad', { value: s.filament.loadSlowLength }),
    ]
      .filter(Boolean)
      .join(' · '),
  );
</script>

<Card title={t('move.speed')} icon={Move}>
  <div class="grid">
    <InputField
      type="number"
      label="X / Y (mm/min)"
      value={s.move.xyFeedrate}
      min={60}
      max={12000}
      onchange={(value) => settings.update((v) => (v.move.xyFeedrate = value))}
      testid="settings-xy-feedrate"
    />
    <InputField
      type="number"
      label="Z (mm/min)"
      value={s.move.zFeedrate}
      min={30}
      max={3000}
      onchange={(value) => settings.update((v) => (v.move.zFeedrate = value))}
      testid="settings-z-feedrate"
    />
  </div>
</Card>

<Card title={t('leveling.paperTest')} icon={Grid3x3}>
  <div class="grid">
    <InputField
      type="number"
      label={t('leveling.inset')}
      value={s.leveling.inset}
      unit=" mm"
      min={0}
      max={80}
      onchange={(value) => settings.update((v) => (v.leveling.inset = value))}
    />
    <InputField
      type="number"
      label={t('leveling.zHop')}
      value={s.leveling.zHop}
      unit=" mm"
      min={1}
      max={30}
      onchange={(value) => settings.update((v) => (v.leveling.zHop = value))}
    />
  </div>
</Card>

<Card title={t('extruder.title')} icon={Spool}>
  <p class="summary" data-testid="extruder-summary">{extruder}</p>
  {#if !s.filament.configured}
    <p class="warn">{t('filament.notConfiguredBanner')}</p>
  {/if}
  <div>
    <Button icon={Settings2} onclick={() => (setup = true)} data-testid="settings-extruder">{t('settings.extruderSetup')}</Button>
  </div>
</Card>

{#if setup}
  <FilamentSetup onclose={() => (setup = false)} />
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-3);
  }
  .summary {
    margin: 0;
    color: var(--text);
    font-size: var(--fs-md);
    font-weight: var(--fw-medium);
  }
  .warn {
    margin: 0;
    color: var(--paused);
    font-size: var(--fs-sm);
  }
</style>
