<script lang="ts">
  import Minus from '@lucide/svelte/icons/minus';
  import Plus from '@lucide/svelte/icons/plus';
  import { onDestroy } from 'svelte';
  import { t } from '../i18n/index.svelte';
  import { pressable } from './press';

  interface Props {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    format?: (value: number) => string;
    disabled?: boolean;
    /** Called after each step (also while holding a button). */
    onchange?: (value: number) => void;
  }

  let {
    value = $bindable(0),
    min = -Infinity,
    max = Infinity,
    step = 1,
    label,
    format = (v: number) => String(v),
    disabled = false,
    onchange,
  }: Props = $props();

  const HOLD_DELAY_MS = 450;
  const REPEAT_MS = 90;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function bump(direction: 1 | -1): boolean {
    const next = Number(Math.min(max, Math.max(min, value + direction * step)).toFixed(6));
    if (next === value) return false;
    value = next;
    onchange?.(next);
    return true;
  }

  function start(event: PointerEvent, direction: 1 | -1) {
    if (disabled || event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    stop();
    bump(direction);
    const repeat = () => {
      if (bump(direction)) timer = setTimeout(repeat, REPEAT_MS);
    };
    timer = setTimeout(repeat, HOLD_DELAY_MS);
  }

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function key(event: KeyboardEvent, direction: 1 | -1) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      bump(direction);
    }
  }

  onDestroy(stop);
</script>

<div class="stepper" class:disabled role="group" aria-label={label}>
  {#if label}<span class="label">{label}</span>{/if}
  <div class="controls">
    <button
      type="button"
      aria-label={t('common.decrease')}
      disabled={disabled || value <= min}
      onpointerdown={(e) => start(e, -1)}
      onpointerup={stop}
      onpointercancel={stop}
      onlostpointercapture={stop}
      onkeydown={(e) => key(e, -1)}
      {@attach pressable}
    >
      <Minus size={26} strokeWidth={2.4} aria-hidden="true" />
    </button>
    <output class="value tabular">{format(value)}</output>
    <button
      type="button"
      aria-label={t('common.increase')}
      disabled={disabled || value >= max}
      onpointerdown={(e) => start(e, 1)}
      onpointerup={stop}
      onpointercancel={stop}
      onlostpointercapture={stop}
      onkeydown={(e) => key(e, 1)}
      {@attach pressable}
    >
      <Plus size={26} strokeWidth={2.4} aria-hidden="true" />
    </button>
  </div>
</div>

<style>
  .stepper {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }
  .label {
    font-weight: var(--fw-medium);
  }
  .controls {
    display: flex;
    align-items: center;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-2);
  }
  button {
    display: grid;
    place-items: center;
    width: var(--touch-lg);
    height: var(--touch);
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--accent-strong);
    touch-action: none;
  }
  button:global([data-pressed]) {
    background: var(--surface-3);
  }
  button:disabled {
    color: var(--text-faint);
  }
  .value {
    flex: 1;
    min-width: 72px;
    text-align: center;
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
  }
  .disabled {
    opacity: 0.38;
  }
</style>
