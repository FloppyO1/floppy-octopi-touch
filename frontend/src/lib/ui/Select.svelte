<script lang="ts" generics="T extends string | number">
  import Check from '@lucide/svelte/icons/check';
  import ChevronDown from '@lucide/svelte/icons/chevron-down';
  import Modal from './Modal.svelte';
  import { pressable } from './press';
  import type { Option } from './types';

  interface Props {
    label: string;
    value: T;
    options: Option<T>[];
    disabled?: boolean;
    testid?: string;
    onchange?: (value: T) => void;
  }

  // No native <select>: its popup is tiny and unstyled on a touch kiosk.
  let { label, value = $bindable(), options, disabled = false, testid, onchange }: Props = $props();

  let open = $state(false);
  const current = $derived(options.find((o) => o.value === value));

  function choose(option: Option<T>) {
    open = false;
    if (option.value === value) return;
    value = option.value;
    onchange?.(option.value);
  }
</script>

<div class="select" class:disabled>
  <span class="label">{label}</span>
  <button
    type="button"
    class="field"
    {disabled}
    onclick={() => (open = true)}
    data-testid={testid}
    {@attach pressable}
  >
    <span class="value">{current?.label ?? String(value ?? '')}</span>
    <ChevronDown size={22} aria-hidden="true" />
  </button>
</div>

{#if open}
  <Modal title={label} onclose={() => (open = false)} width={480}>
    <div class="options" role="listbox" aria-label={label}>
      {#each options as option (option.value)}
        <button
          type="button"
          role="option"
          aria-selected={option.value === value}
          class="option"
          class:selected={option.value === value}
          onclick={() => choose(option)}
          {@attach pressable}
        >
          <span>{option.label}</span>
          {#if option.value === value}<Check size={22} aria-hidden="true" />{/if}
        </button>
      {/each}
    </div>
  </Modal>
{/if}

<style>
  .select {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    min-width: 0;
  }
  .label {
    font-weight: var(--fw-medium);
  }
  .field {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    width: 100%;
    min-height: var(--touch);
    padding: 0 var(--sp-4);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-2);
    color: var(--text-dim);
    text-align: left;
  }
  .field:global([data-pressed]) {
    border-color: var(--accent);
  }
  .value {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font-size: var(--fs-lg);
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
  }
  .option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--touch);
    padding: 0 var(--sp-4);
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--text);
    font-size: var(--fs-lg);
    text-align: left;
  }
  .option:global([data-pressed]) {
    background: var(--surface-2);
  }
  .selected {
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: var(--fw-medium);
  }
  .disabled {
    opacity: 0.38;
  }
</style>
