<script lang="ts">
  // Jog speeds, paper test geometry and the extruder setup (same dialog as the Filament screen).
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleMinus from '@lucide/svelte/icons/circle-minus';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import Grid3x3 from '@lucide/svelte/icons/grid-3x3';
  import Move from '@lucide/svelte/icons/move';
  import OctagonX from '@lucide/svelte/icons/octagon-x';
  import Settings2 from '@lucide/svelte/icons/settings-2';
  import Spool from '@lucide/svelte/icons/spool';
  import Wrench from '@lucide/svelte/icons/wrench';
  import type { CheckState } from '../../../lib/core/stopScript';
  import { t } from '../../../lib/i18n/index.svelte';
  import { settings, stopScript } from '../../../lib/stores';
  import Button from '../../../lib/ui/Button.svelte';
  import Card from '../../../lib/ui/Card.svelte';
  import InputField from '../../../lib/ui/InputField.svelte';
  import Toggle from '../../../lib/ui/Toggle.svelte';
  import FilamentSetup from '../../filament/FilamentSetup.svelte';
  import { fixStopScript } from '../actions';

  const STOP_ITEMS = ['motors', 'hotends', 'bed', 'fan'] as const;
  const STATE_ICON: Record<CheckState, typeof CircleCheck> = { ok: CircleCheck, missing: CircleX, na: CircleMinus };
  const stop = $derived(stopScript.status);

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

<Card title={t('stopScript.title')} icon={OctagonX}>
  <p class="hint">{t('stopScript.hint')}</p>
  {#if stop}
    <ul class="checks" data-testid="stop-script-status">
      {#each STOP_ITEMS as item (item)}
        {@const Icon = STATE_ICON[stop[item]]}
        <li class="check state-{stop[item]}" data-testid="stop-script-{item}" data-state={stop[item]}>
          <Icon size={22} aria-hidden="true" />
          <span class="name">{t(`stopScript.${item}`)}</span>
          {#if stop[item] !== 'ok'}<span class="state">{t(`stopScript.state.${stop[item]}`)}</span>{/if}
        </li>
      {/each}
    </ul>
    {#if stop.missing.length}
      <div>
        <Button variant="primary" icon={Wrench} disabled={stopScript.busy} onclick={fixStopScript} data-testid="stop-script-fix">
          {t('stopScript.fix')}
        </Button>
      </div>
    {:else}
      <p class="summary">{t('stopScript.allOff')}</p>
    {/if}
  {:else}
    <p class="warn">{t('stopScript.unknown')}</p>
  {/if}
  <div data-testid="stop-script-remind">
    <Toggle
      label={t('stopScript.remind')}
      hint={t('stopScript.remindHint')}
      checked={s.stopScript.remind}
      onchange={(on) => settings.update((v) => (v.stopScript.remind = on))}
    />
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
  .hint {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .checks {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-2) var(--sp-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .check {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    font-size: var(--fs-md);
  }
  .check .name {
    flex: 1;
  }
  .check .state {
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .state-ok :global(svg) {
    color: var(--ok);
  }
  .state-missing :global(svg),
  .state-missing .state {
    color: var(--error);
  }
  .state-na :global(svg) {
    color: var(--text-dim);
  }
</style>
