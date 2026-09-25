<script lang="ts" generics="T extends string | number">
  // Segmented control: one choice out of a few, always visible (jog step, chart window, lengths).
  import Button from './Button.svelte';
  import type { Option } from './types';

  interface Props {
    /** Accessible name of the group. */
    label: string;
    value: T;
    options: Option<T>[];
    disabled?: boolean;
    /** Each button gets `data-testid="<testid>-<value>"`. */
    testid?: string;
    onchange?: (value: T) => void;
  }

  let { label, value = $bindable(), options, disabled = false, testid, onchange }: Props = $props();

  function choose(next: T) {
    if (next === value) return;
    value = next;
    onchange?.(next);
  }
</script>

<div class="segmented" role="radiogroup" aria-label={label}>
  {#each options as option (option.value)}
    <Button
      role="radio"
      aria-checked={option.value === value}
      selected={option.value === value}
      {disabled}
      onclick={() => choose(option.value)}
      data-testid={testid ? `${testid}-${option.value}` : undefined}
    >
      {option.label}
    </Button>
  {/each}
</div>

<style>
  .segmented {
    display: flex;
    gap: var(--sp-1);
  }
  .segmented :global(.btn) {
    flex: 1;
    padding: 0 var(--sp-3);
  }
</style>
