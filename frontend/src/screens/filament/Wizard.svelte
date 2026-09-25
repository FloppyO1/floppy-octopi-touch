<script lang="ts">
  // Guided load/unload/change: one card whose body follows the wizard step.
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Droplets from '@lucide/svelte/icons/droplets';
  import Flame from '@lucide/svelte/icons/flame';
  import Hand from '@lucide/svelte/icons/hand';
  import Play from '@lucide/svelte/icons/play';
  import Settings2 from '@lucide/svelte/icons/settings-2';
  import Snowflake from '@lucide/svelte/icons/snowflake';
  import Spool from '@lucide/svelte/icons/spool';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { bowdenOf, reachedTarget, type FilamentAction } from '../../lib/core/filament';
  import { formatTemp } from '../../lib/core/format';
  import { heaterTone } from '../../lib/core/gauge';
  import { t } from '../../lib/i18n/index.svelte';
  import { capabilities, printer, settings, temperatures } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import Card from '../../lib/ui/Card.svelte';
  import { dialogs } from '../../lib/ui/dialogs.svelte';
  import RingGauge from '../../lib/ui/RingGauge.svelte';
  import Segmented from '../../lib/ui/Segmented.svelte';
  import { heaterOff } from '../heaterTarget';
  import { wizard } from './flow.svelte';

  interface Props {
    locked: boolean;
    onsetup: () => void;
  }

  let { locked, onsetup }: Props = $props();

  const f = $derived(settings.value.filament);
  const hotend = $derived(temperatures.latest.tool0);
  let presetId = $state(settings.value.presets[0]?.id ?? '');
  const selected = $derived(settings.value.presets.find((p) => p.id === presetId) ?? settings.value.presets[0] ?? null);

  const actionOptions = $derived<{ value: FilamentAction; label: string }[]>([
    { value: 'load', label: t('filament.load') },
    { value: 'unload', label: t('filament.unload') },
    ...(capabilities.has('advancedPause') ? [{ value: 'change' as const, label: t('filament.change') }] : []),
  ]);
  $effect(() => {
    if (!actionOptions.some((a) => a.value === wizard.action)) wizard.action = 'load';
  });

  // Heat-up step: move on as soon as the hot end is there.
  $effect(() => {
    if (wizard.step === 'heat' && reachedTarget(hotend?.actual, wizard.temperature)) wizard.heated();
  });
  // Printer gone (disconnected, or a job started elsewhere): back to the start.
  $effect(() => {
    if (locked && wizard.step !== 'material' && !wizard.run) wizard.reset();
  });

  const summary = $derived(
    [
      t(`extruder.${f.extruderType}`),
      f.extruderType === 'bowden' ? t('filament.summaryBowden', { value: bowdenOf(f) }) : null,
      wizard.firmware ? 'M701 / M702' : t('filament.summaryLoad', { value: f.loadSlowLength }),
    ]
      .filter(Boolean)
      .join(' · '),
  );

  async function start() {
    if (!selected) return;
    if (!f.configured && !wizard.defaultsAccepted) {
      const setup = await dialogs.confirm({
        title: t('filament.notConfiguredTitle'),
        message: t('filament.notConfiguredMessage'),
        confirmLabel: t('filament.setupNow'),
        cancelLabel: t('filament.useDefaults'),
        tone: 'warning',
      });
      if (setup) {
        onsetup();
        return;
      }
      wizard.defaultsAccepted = true;
    }
    await wizard.start(selected);
  }

  async function coolDown() {
    await heaterOff('tool0');
    wizard.reset();
  }

  const runText = $derived.by(() => {
    const kind = wizard.run?.kind;
    if (kind === 'change') return t('filament.runChange');
    if (kind === 'purge') return t('filament.runPurge');
    if (wizard.firmware) return t(kind === 'load' ? 'filament.runFirmwareLoad' : 'filament.runFirmwareUnload');
    return t(kind === 'load' ? 'filament.runLoad' : 'filament.runUnload');
  });
</script>

<Card title={t('filament.wizard')} icon={Spool} class="wizard" data-testid="wizard" data-step={wizard.step}>
  {#snippet actions()}
    <Button variant="ghost" icon={Settings2} onclick={onsetup} data-testid="filament-setup-open">{t('extruder.title')}</Button>
  {/snippet}

  <ol class="steps" aria-label={t('filament.wizard')}>
    {#each wizard.steps as step, index (step)}
      {@const current = wizard.steps.indexOf(wizard.step)}
      <!-- Only the current step is spelled out: six labels do not fit the card. -->
      <li class:done={index < current} class:current={index === current} aria-label={t(`filament.step.${step}`)}>
        <span class="num">{index + 1}</span>{#if index === current}{t(`filament.step.${step}`)}{/if}
      </li>
    {/each}
  </ol>

  <div class="body">
    {#if wizard.step === 'material'}
      {#if !f.configured}
        <p class="warn" data-testid="filament-not-configured">
          <TriangleAlert size={20} aria-hidden="true" />{t('filament.notConfiguredBanner')}
        </p>
      {/if}
      <Segmented label={t('filament.action')} bind:value={wizard.action} options={actionOptions} disabled={locked} testid="filament-action" />
      <div class="materials" role="radiogroup" aria-label={t('filament.material')}>
        {#each settings.value.presets as preset (preset.id)}
          <Button
            role="radio"
            aria-checked={selected?.id === preset.id}
            selected={selected?.id === preset.id}
            disabled={locked}
            onclick={() => (presetId = preset.id)}
            data-testid="material-{preset.id}"
          >
            <span class="mat-name">{preset.name}</span>
            <span class="mat-temp tabular">{preset.hotend}°C</span>
          </Button>
        {/each}
      </div>
      <p class="summary">{summary}</p>
      <div class="row">
        <Button variant="primary" size="lg" icon={Play} disabled={locked || !selected} onclick={start} data-testid="wizard-start">
          {t('filament.start', { temp: selected?.hotend ?? 0 })}
        </Button>
      </div>
    {:else if wizard.step === 'heat'}
      <div class="center">
        <RingGauge
          size="L"
          label={t('heater.tool0')}
          icon={Flame}
          value={hotend?.actual}
          target={wizard.temperature}
          max={settings.value.temperature.max.hotend}
          unit="°"
          sublabel={t('gauge.target', { value: formatTemp(wizard.temperature) })}
          tone={heaterTone(hotend?.actual, wizard.temperature)}
          testid="wizard-gauge"
        />
        <p class="message">{t('filament.heating', { name: wizard.preset?.name ?? '', temp: wizard.temperature })}</p>
      </div>
      <div class="row">
        <Button size="lg" onclick={() => wizard.cancel()} data-testid="wizard-cancel">{t('common.cancel')}</Button>
      </div>
    {:else if wizard.step === 'insert'}
      <div class="center">
        <Hand size={64} strokeWidth={1.4} aria-hidden="true" />
        <p class="message">{t('filament.insert')}</p>
      </div>
      <div class="row">
        <Button size="lg" onclick={() => wizard.cancel()}>{t('common.cancel')}</Button>
        <Button variant="primary" size="lg" icon={Play} onclick={() => wizard.execute('load')} data-testid="wizard-load">
          {t('filament.load')}
        </Button>
      </div>
    {:else if wizard.step === 'run'}
      <div class="center">
        <p class="message">{runText}</p>
        {#key wizard.run?.id}
          <div class="bar" class:indeterminate={wizard.run?.seconds == null} data-testid="wizard-progress">
            <span style:animation-duration="{wizard.run?.seconds ?? 2}s"></span>
          </div>
        {/key}
      </div>
      <div class="row">
        <Button size="lg" onclick={() => wizard.cancel()} data-testid="wizard-stop">{t('filament.stop')}</Button>
        {#if wizard.run?.kind === 'change'}
          <Button variant="primary" size="lg" onclick={() => wizard.finishRun()}>{t('filament.changeDone')}</Button>
        {/if}
      </div>
    {:else if wizard.step === 'purge'}
      <div class="center">
        <Droplets size={64} strokeWidth={1.4} aria-hidden="true" />
        <p class="message">{t('filament.purgeQuestion')}</p>
      </div>
      <div class="row">
        <Button size="lg" icon={Droplets} onclick={() => wizard.execute('purge')} data-testid="wizard-purge">
          {t('filament.purgeMore', { value: f.purgeLength })}
        </Button>
        <Button variant="primary" size="lg" icon={CircleCheck} onclick={() => (wizard.step = 'done')} data-testid="wizard-clean">
          {t('filament.clean')}
        </Button>
      </div>
    {:else}
      <div class="center">
        <CircleCheck size={64} strokeWidth={1.4} class="ok" aria-hidden="true" />
        <p class="message">{t(`filament.done.${wizard.action}`)}</p>
      </div>
      <div class="row">
        <Button size="lg" icon={Snowflake} disabled={!printer.operational} onclick={coolDown} data-testid="wizard-cool">
          {t('filament.coolDown')}
        </Button>
        <Button variant="primary" size="lg" onclick={() => wizard.reset()} data-testid="wizard-finish">{t('filament.finish')}</Button>
      </div>
    {/if}
  </div>
</Card>

<style>
  :global(.card.wizard) {
    min-height: 0;
  }
  .steps {
    display: flex;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .steps li {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--text-faint);
    font-size: var(--fs-sm);
    white-space: nowrap;
  }
  .steps li + li::before {
    content: '';
    width: 24px;
    height: 1px;
    margin-right: 2px;
    background: var(--border);
  }
  .num {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--surface-3);
    font-size: var(--fs-xs);
    font-weight: var(--fw-bold);
  }
  .steps .done {
    color: var(--text-dim);
  }
  .steps .done .num {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .steps .current {
    color: var(--text);
    font-weight: var(--fw-medium);
  }
  .steps .current .num {
    background: var(--accent);
    color: var(--on-accent);
  }
  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--sp-3);
    min-height: 0;
  }
  .warn {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    padding: var(--sp-2) var(--sp-3);
    border-radius: var(--r-md);
    background: var(--paused-soft);
    color: var(--paused);
    font-size: var(--fs-sm);
  }
  .materials {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: var(--sp-2);
    max-height: 144px;
    overflow-y: auto;
  }
  .materials :global(.btn) {
    min-height: 64px;
  }
  .materials :global(.label) {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .mat-name {
    font-weight: var(--fw-bold);
  }
  .mat-temp {
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .summary {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--fs-sm);
  }
  .row {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-3);
    margin-top: auto;
  }
  .row :global(.btn) {
    min-width: 160px;
  }
  .center {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-3);
    color: var(--text-dim);
    text-align: center;
  }
  .center :global(.ok) {
    color: var(--ok);
  }
  .message {
    max-width: 440px;
    margin: 0;
    color: var(--text);
    font-size: var(--fs-lg);
    white-space: pre-line;
  }
  .bar {
    position: relative;
    width: 360px;
    height: 12px;
    border-radius: var(--r-pill);
    background: var(--surface-3);
    overflow: hidden;
  }
  .bar span {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--accent);
    transform-origin: left;
    animation: fill linear forwards;
  }
  .bar.indeterminate span {
    width: 35%;
    animation: slide 1.4s ease-in-out infinite !important;
  }
  @keyframes fill {
    from {
      transform: scaleX(0);
    }
    to {
      transform: scaleX(1);
    }
  }
  @keyframes slide {
    from {
      transform: translateX(-100%);
    }
    to {
      transform: translateX(300%);
    }
  }
</style>
