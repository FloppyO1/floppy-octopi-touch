<script lang="ts">
  import { t } from '../i18n/index.svelte';
  import Button from './Button.svelte';
  import Modal from './Modal.svelte';
  import Slider from './Slider.svelte';
  import Stepper from './Stepper.svelte';
  import type { IconComponent, Option } from './types';

  interface Props {
    title: string;
    icon?: IconComponent;
    value?: number | null;
    min?: number;
    max?: number;
    /** Slider resolution. */
    step?: number;
    /** +/- buttons (default: the slider step). */
    fineStep?: number;
    unit?: string;
    /** Quick values: a tap applies them right away. */
    presets?: Option<number>[];
    onsubmit: (value: number) => void;
    oncancel: () => void;
  }

  let {
    title,
    icon,
    value = null,
    min = 0,
    max = 100,
    step = 1,
    fineStep,
    unit = '',
    presets = [],
    onsubmit,
    oncancel,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let current = $state(Math.min(max, Math.max(min, value ?? min)));
  const format = (v: number) => `${v}${unit}`;
</script>

<Modal {title} {icon} tone="accent" onclose={oncancel} width={640} layer="top" testid="slider-dialog">
  <div class="body">
    <Stepper bind:value={current} {min} {max} step={fineStep ?? step} {format} />
    <Slider bind:value={current} {min} {max} {step} label={t('slider.drag')} {format} />
    {#if presets.length}
      <div class="presets">
        {#each presets as preset (preset.label)}
          <Button variant="secondary" selected={current === preset.value} onclick={() => onsubmit(preset.value)}>
            {preset.label}
          </Button>
        {/each}
      </div>
    {/if}
  </div>
  {#snippet actions()}
    <Button variant="secondary" size="lg" onclick={oncancel}>{t('common.cancel')}</Button>
    <Button variant="primary" size="lg" onclick={() => onsubmit(current)} data-testid="slider-apply">
      {t('slider.apply', { value: format(current) })}
    </Button>
  {/snippet}
</Modal>

<style>
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    color: var(--text);
  }
  .body :global(.stepper .value) {
    font-size: var(--fs-3xl);
  }
  .body :global(.stepper button) {
    width: 96px;
    height: var(--touch-lg);
  }
  .presets {
    display: grid;
    grid-auto-columns: 1fr;
    grid-auto-flow: column;
    gap: var(--sp-2);
  }
</style>
