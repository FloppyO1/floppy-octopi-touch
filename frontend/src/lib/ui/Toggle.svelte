<script lang="ts">
  import { pressable } from './press';

  interface Props {
    checked?: boolean;
    label?: string;
    /** Secondary text under the label. */
    hint?: string;
    disabled?: boolean;
    onchange?: (checked: boolean) => void;
  }

  let { checked = $bindable(false), label, hint, disabled = false, onchange }: Props = $props();

  function toggle() {
    checked = !checked;
    onchange?.(checked);
  }
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  aria-label={label}
  class="toggle"
  class:on={checked}
  class:bare={!label}
  {disabled}
  onclick={toggle}
  {@attach pressable}
>
  {#if label}
    <span class="text">
      <span class="label">{label}</span>
      {#if hint}<span class="hint">{hint}</span>{/if}
    </span>
  {/if}
  <span class="track" aria-hidden="true"><span class="thumb"></span></span>
</button>

<style>
  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sp-4);
    width: 100%;
    min-height: var(--touch);
    padding: var(--sp-2) 0;
    border: 0;
    background: none;
    text-align: left;
  }
  .bare {
    width: auto;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .label {
    font-weight: var(--fw-medium);
  }
  .hint {
    font-size: var(--fs-sm);
    color: var(--text-dim);
  }
  .track {
    position: relative;
    flex: none;
    width: 68px;
    height: 38px;
    border-radius: var(--r-pill);
    background: var(--surface-3);
    transition: background-color var(--dur) var(--ease);
  }
  .thumb {
    position: absolute;
    top: 4px;
    left: 4px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--text-dim);
    box-shadow: var(--shadow-1);
    transition:
      transform var(--dur) var(--ease),
      background-color var(--dur) var(--ease);
  }
  .on .track {
    background: var(--accent);
  }
  .on .thumb {
    transform: translateX(30px);
    background: var(--on-accent);
  }
  .toggle:global([data-pressed]) .thumb {
    width: 34px;
  }
  .on:global([data-pressed]) .thumb {
    transform: translateX(26px);
  }
  .toggle:disabled {
    opacity: 0.38;
  }
</style>
