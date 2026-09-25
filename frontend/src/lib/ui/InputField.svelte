<script lang="ts">
  import Keyboard from '@lucide/svelte/icons/keyboard';
  import Hash from '@lucide/svelte/icons/hash';
  import type { KeyboardLayer } from '../core/keyboard';
  import { dialogs } from './dialogs.svelte';
  import { pressable } from './press';
  import type { Option } from './types';

  type Props = {
    label: string;
    placeholder?: string;
    disabled?: boolean;
    testid?: string;
  } & (
    | {
        type?: 'text' | 'gcode';
        value?: string;
        multiline?: boolean;
        maxLength?: number;
        onchange?: (value: string) => void;
      }
    | {
        type: 'number';
        value?: number | null;
        unit?: string;
        min?: number;
        max?: number;
        decimals?: number;
        presets?: Option<number>[];
        onchange?: (value: number) => void;
      }
  );

  let { value = $bindable(), ...props }: Props = $props();

  const isNumber = $derived(props.type === 'number');
  const shown = $derived.by(() => {
    if (value === undefined || value === null || value === '') return '';
    return props.type === 'number' ? `${value}${props.unit ?? ''}` : String(value);
  });

  // Tapping the field opens the in-app NumPad or keyboard; the value changes only on OK.
  async function open() {
    if (props.disabled) return;
    if (props.type === 'number') {
      const { label, unit, min, max, decimals, presets, onchange } = props;
      const next = await dialogs.number({
        title: label,
        value: typeof value === 'number' ? value : null,
        unit,
        min,
        max,
        decimals,
        presets,
      });
      if (next === null) return;
      value = next;
      onchange?.(next);
    } else {
      const { label, placeholder, multiline, maxLength, onchange } = props;
      const layer: KeyboardLayer = props.type === 'gcode' ? 'gcode' : 'letters';
      const next = await dialogs.text({
        title: label,
        value: typeof value === 'string' ? value : '',
        layer,
        multiline,
        maxLength,
        placeholder,
      });
      if (next === null) return;
      value = next;
      onchange?.(next);
    }
  }
</script>

<div class="input" class:disabled={props.disabled}>
  <span class="label">{props.label}</span>
  <button
    type="button"
    class="field"
    class:mono={props.type === 'gcode'}
    class:multiline={props.type !== 'number' && props.multiline}
    disabled={props.disabled}
    onclick={open}
    data-testid={props.testid}
    {@attach pressable}
  >
    <span class="value" class:placeholder={!shown}>{shown || props.placeholder || ''}</span>
    {#if isNumber}
      <Hash size={20} aria-hidden="true" />
    {:else}
      <Keyboard size={20} aria-hidden="true" />
    {/if}
  </button>
</div>

<style>
  .input {
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
    background: var(--bg);
    color: var(--text-faint);
    text-align: left;
    transition: border-color var(--dur) var(--ease);
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
  .multiline .value {
    /* Margin, not padding: overflow is clipped at the padding edge, so a 4th line showed through it. */
    margin: var(--sp-2) 0;
    white-space: pre-line;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
  }
  .mono .value {
    font-family: var(--font-mono);
  }
  .placeholder {
    color: var(--text-faint);
  }
  .disabled {
    opacity: 0.38;
  }
</style>
