<script lang="ts">
  import Delete from '@lucide/svelte/icons/delete';
  import {
    applyNumpadKey,
    initialEntry,
    parseEntry,
    type NumpadKey,
    type NumpadOptions,
  } from '../core/numpad';
  import { t } from '../i18n/index.svelte';
  import Button from './Button.svelte';
  import Modal from './Modal.svelte';
  import { pressable } from './press';
  import type { Option } from './types';

  interface Props {
    title: string;
    value?: number | null;
    unit?: string;
    min?: number;
    max?: number;
    decimals?: number;
    /** Quick values (e.g. temperature presets): a tap submits them right away. */
    presets?: Option<number>[];
    onsubmit: (value: number) => void;
    oncancel: () => void;
  }

  let { title, value = null, unit = '', min, max, decimals = 0, presets = [], onsubmit, oncancel }: Props =
    $props();

  const options: NumpadOptions = $derived({ min, max, decimals });
  // svelte-ignore state_referenced_locally
  let entry = $state(initialEntry(value, decimals));
  const parsed = $derived(parseEntry(entry.text, options));
  const allowNegative = $derived((min ?? 0) < 0);

  const errorText = $derived.by(() => {
    const error = parsed.error;
    if (!error || error.kind === 'empty') return '';
    return t(error.kind === 'max' ? 'numpad.max' : 'numpad.min', { value: `${error.limit}${unit}` });
  });
  const rangeText = $derived(
    min !== undefined && max !== undefined ? t('numpad.range', { min, max, unit }) : '',
  );

  function press(key: NumpadKey) {
    entry = applyNumpadKey(entry, key, options);
  }
  function submit() {
    if (parsed.value !== null) onsubmit(parsed.value);
  }
  function keydown(event: KeyboardEvent) {
    // Physical keyboard in dev.
    if (/^[0-9.-]$/.test(event.key)) press(event.key as NumpadKey);
    else if (event.key === 'Backspace') press('back');
    else if (event.key === 'Enter') submit();
  }

  const DIGIT_ROWS: NumpadKey[][] = [
    ['7', '8', '9'],
    ['4', '5', '6'],
    ['1', '2', '3'],
  ];
</script>

<svelte:window onkeydown={keydown} />

<Modal {title} onclose={oncancel} width={720} layer="top" testid="numpad">
  <div class="numpad">
    <div class="side">
      <div class="display" class:invalid={errorText} class:fresh={entry.fresh} data-testid="numpad-display">
        <span class="entry tabular">{entry.text || '0'}</span>
        {#if unit}<span class="unit">{unit}</span>{/if}
      </div>
      <p class="message" class:error={errorText}>{errorText || rangeText}</p>
      {#if presets.length}
        <div class="presets">
          {#each presets as preset (preset.label)}
            <Button variant="secondary" block onclick={() => onsubmit(preset.value)}>
              <span class="preset-label">{preset.label}</span>
              <span class="preset-value tabular">{preset.value}{unit}</span>
            </Button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="keys">
      {#each DIGIT_ROWS as row, index (index)}
        {#each row as key (key)}
          <button type="button" class="key" onclick={() => press(key)} {@attach pressable}>{key}</button>
        {/each}
        {#if index === 0}
          <button
            type="button"
            class="key fn"
            aria-label={t('numpad.backspace')}
            onclick={() => press('back')}
            {@attach pressable}
          >
            <Delete size={28} aria-hidden="true" />
          </button>
        {:else if index === 1}
          <button type="button" class="key fn" onclick={() => press('clear')} {@attach pressable}>
            {t('numpad.clear')}
          </button>
        {:else}
          <button
            type="button"
            class="key fn"
            disabled={!allowNegative}
            aria-label={t('numpad.sign')}
            onclick={() => press('-')}
            {@attach pressable}
          >
            ±
          </button>
        {/if}
      {/each}
      <button
        type="button"
        class="key"
        disabled={decimals === 0}
        aria-label={t('numpad.point')}
        onclick={() => press('.')}
        {@attach pressable}
      >
        .
      </button>
      <button type="button" class="key" onclick={() => press('0')} {@attach pressable}>0</button>
      <button
        type="button"
        class="key ok"
        disabled={parsed.value === null}
        onclick={submit}
        data-testid="numpad-ok"
        {@attach pressable}
      >
        {t('common.ok')}
      </button>
    </div>
  </div>
</Modal>

<style>
  .numpad {
    display: grid;
    grid-template-columns: 1fr 368px;
    gap: var(--sp-5);
    color: var(--text);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-width: 0;
  }
  .display {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: var(--sp-2);
    height: 80px;
    padding: 0 var(--sp-4);
    border: 2px solid var(--accent);
    border-radius: var(--r-md);
    background: var(--bg);
    line-height: 80px;
  }
  .display.invalid {
    border-color: var(--error);
  }
  .entry {
    font-size: var(--fs-3xl);
    font-weight: var(--fw-bold);
  }
  .fresh .entry {
    color: var(--text-dim);
  }
  .unit {
    font-size: var(--fs-xl);
    color: var(--text-dim);
  }
  .message {
    min-height: 22px;
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--text-dim);
  }
  .message.error {
    color: var(--error);
    font-weight: var(--fw-medium);
  }
  .presets {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    overflow-y: auto;
  }
  .presets :global(.btn .label) {
    display: flex;
    justify-content: space-between;
    width: 100%;
  }
  .preset-value {
    color: var(--text-dim);
  }
  .keys {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: 64px;
    gap: var(--sp-2);
  }
  .key {
    display: grid;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-2);
    font-size: var(--fs-2xl);
    font-weight: var(--fw-medium);
    transition: transform var(--dur-fast) var(--ease);
  }
  .fn {
    font-size: var(--fs-lg);
    color: var(--text-dim);
  }
  .ok {
    grid-column: span 2;
    border: 0;
    background: var(--accent);
    color: var(--on-accent);
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
  }
  .key:global([data-pressed]) {
    transform: scale(0.95);
    background: var(--surface-3);
  }
  .ok:global([data-pressed]) {
    background: var(--accent-strong);
  }
  .key:disabled {
    opacity: 0.3;
  }
</style>
