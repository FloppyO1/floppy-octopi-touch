<script lang="ts">
  // Move: X/Y/Z jog with selectable steps (kept inside the profile's build volume), homing, motors off,
  // head position (M114), part fan and jog speeds. Locked while a job is running.
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Crosshair from '@lucide/svelte/icons/crosshair';
  import Fan from '@lucide/svelte/icons/fan';
  import Gauge from '@lucide/svelte/icons/gauge';
  import House from '@lucide/svelte/icons/house';
  import Lock from '@lucide/svelte/icons/lock';
  import MoveIcon from '@lucide/svelte/icons/move';
  import PowerOff from '@lucide/svelte/icons/power-off';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import { untrack } from 'svelte';
  import type { Axis } from '../lib/api/types';
  import { formatAxis } from '../lib/core/move';
  import { JOG_STEPS } from '../lib/core/settings';
  import { t } from '../lib/i18n/index.svelte';
  import { printer, server, settings, tune } from '../lib/stores';
  import Button from '../lib/ui/Button.svelte';
  import Card from '../lib/ui/Card.svelte';
  import IconButton from '../lib/ui/IconButton.svelte';
  import InputField from '../lib/ui/InputField.svelte';
  import Segmented from '../lib/ui/Segmented.svelte';
  import type { IconComponent } from '../lib/ui/types';
  import { askFan } from './home/actions';
  import { home, jog, motorsOff, readPosition } from './move/actions';

  const locked = $derived(!printer.operational || printer.busy);
  const steps = JOG_STEPS.map((s) => ({ value: s, label: String(s) }));
  const volume = $derived(server.profile?.volume);
  const AXES = ['x', 'y', 'z'] as const;

  // Ask for the position once when the screen opens (the answer fills the readout).
  $effect(() => {
    if (!locked && untrack(() => printer.position) === null) void readPosition();
  });
</script>

{#snippet jogButton(axis: Axis, direction: 1 | -1, icon: IconComponent, label: string)}
  <Button
    class="pad-btn"
    {icon}
    disabled={locked}
    aria-label={t('move.jogLabel', { axis: axis.toUpperCase(), dir: direction > 0 ? '+' : '−' })}
    onclick={() => jog(axis, direction)}
    data-testid="jog-{axis}{direction > 0 ? 'plus' : 'minus'}"
  >
    {label}
  </Button>
{/snippet}

<div class="move">
  <Card title={t('move.jog')} icon={MoveIcon} class="jog">
    {#snippet actions()}
      <span class="step-label">{t('move.step')}</span>
      <Segmented
        label={t('move.step')}
        value={settings.value.move.step}
        options={steps}
        onchange={(step) => settings.update((s) => (s.move.step = step))}
        testid="jog-step"
      />
    {/snippet}
    <div class="pads">
      <div class="xy" role="group" aria-label={t('move.xy')}>
        <span></span>
        {@render jogButton('y', 1, ArrowUp, 'Y+')}
        <span></span>
        {@render jogButton('x', -1, ArrowLeft, 'X−')}
        <Button class="pad-btn home" icon={House} disabled={locked} onclick={() => home(['x', 'y'])} data-testid="home-xy">XY</Button>
        {@render jogButton('x', 1, ArrowRight, 'X+')}
        <span></span>
        {@render jogButton('y', -1, ArrowDown, 'Y−')}
        <span></span>
      </div>
      <div class="z" role="group" aria-label={t('move.z')}>
        {@render jogButton('z', 1, ArrowUp, 'Z+')}
        <Button class="pad-btn home" icon={House} disabled={locked} onclick={() => home(['z'])} data-testid="home-z">Z</Button>
        {@render jogButton('z', -1, ArrowDown, 'Z−')}
      </div>
    </div>
    {#if printer.busy}
      <p class="locked" data-testid="move-locked"><Lock size={18} aria-hidden="true" />{t('move.locked')}</p>
    {:else}
      <p class="hint">
        {volume ? t('move.limits', { x: volume.width, y: volume.depth, z: volume.height }) : t('move.noLimits')}
      </p>
    {/if}
  </Card>

  <div class="side">
    <Card title={t('move.position')} icon={Crosshair} compact>
      {#snippet actions()}
        <IconButton icon={RefreshCw} label={t('move.readPosition')} variant="ghost" disabled={locked} onclick={readPosition} data-testid="read-position" />
      {/snippet}
      <dl class="position" data-testid="position">
        {#each AXES as axis (axis)}
          <div>
            <dt>{axis.toUpperCase()}</dt>
            <dd class="tabular" data-testid="pos-{axis}">{formatAxis(printer.position?.[axis])}</dd>
          </div>
        {/each}
      </dl>
      {#if !printer.position}<p class="hint">{t('move.positionUnknown')}</p>{/if}
    </Card>

    <Card compact>
      <Button variant="primary" size="lg" icon={House} disabled={locked} onclick={() => home(['x', 'y', 'z'])} data-testid="home-all">
        {t('move.homeAll')}
      </Button>
      <div class="pair">
        <Button icon={PowerOff} disabled={locked} onclick={motorsOff} data-testid="motors-off">{t('move.motorsOff')}</Button>
        <Button icon={Fan} disabled={!printer.operational} onclick={askFan} data-testid="move-fan">
          {tune.fan === null ? t('gauge.fan') : `${t('gauge.fan')} ${tune.fan}%`}
        </Button>
      </div>
    </Card>

    <Card title={t('move.speed')} icon={Gauge} compact>
      <div class="pair">
        <InputField
          type="number"
          label="X / Y (mm/min)"
          value={settings.value.move.xyFeedrate}
          min={60}
          max={12000}
          onchange={(v) => settings.update((s) => (s.move.xyFeedrate = v))}
          testid="speed-xy"
        />
        <InputField
          type="number"
          label="Z (mm/min)"
          value={settings.value.move.zFeedrate}
          min={30}
          max={3000}
          onchange={(v) => settings.update((s) => (s.move.zFeedrate = v))}
          testid="speed-z"
        />
      </div>
    </Card>
  </div>
</div>

<style>
  .move {
    display: grid;
    grid-template-columns: 1fr 360px;
    gap: var(--sp-3);
    height: 100%;
    padding: var(--sp-3);
  }
  .move :global(.jog) {
    min-height: 0;
  }
  .move :global(.jog .actions) {
    align-items: center;
  }
  .step-label {
    color: var(--text-faint);
    font-size: var(--fs-sm);
  }
  .move :global(.jog .segmented .btn) {
    min-width: 64px;
  }
  .pads {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: var(--sp-6);
  }
  .xy {
    display: grid;
    grid-template-columns: repeat(3, 104px);
    grid-template-rows: repeat(3, 104px);
    gap: var(--sp-2);
  }
  .z {
    display: grid;
    grid-template-rows: repeat(3, 104px);
    width: 104px;
    gap: var(--sp-2);
  }
  .pads :global(.pad-btn) {
    flex-direction: column;
    gap: 4px;
    width: 100%;
    height: 100%;
    padding: 0;
    font-size: var(--fs-lg);
    font-weight: var(--fw-bold);
  }
  .pads :global(.pad-btn svg) {
    width: 32px;
    height: 32px;
    color: var(--accent-strong);
  }
  .pads :global(.pad-btn.home) {
    background: var(--surface-3);
    font-size: var(--fs-md);
  }
  .pads :global(.pad-btn.home svg) {
    width: 26px;
    height: 26px;
    color: var(--text-dim);
  }
  .hint,
  .locked {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--fs-sm);
    text-align: center;
  }
  .locked {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    padding: var(--sp-2);
    border-radius: var(--r-md);
    background: var(--paused-soft);
    color: var(--paused);
    font-size: var(--fs-md);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-height: 0;
  }
  .position {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-2);
    margin: 0;
  }
  .position div {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--sp-2) 0;
    border-radius: var(--r-md);
    background: var(--surface-2);
  }
  dt {
    color: var(--text-dim);
    font-size: var(--fs-sm);
    font-weight: var(--fw-bold);
  }
  dd {
    margin: 0;
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-2);
  }
  .pair :global(.btn) {
    gap: 6px;
    padding: 0 var(--sp-2);
  }
</style>
