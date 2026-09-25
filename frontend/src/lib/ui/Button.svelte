<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import { pressable } from './press';
  import type { ButtonSize, ButtonVariant, IconComponent } from './types';

  interface Props extends HTMLButtonAttributes {
    variant?: ButtonVariant;
    size?: ButtonSize;
    icon?: IconComponent;
    /** Full width of the container. */
    block?: boolean;
    /** Toggle buttons (segmented controls, layout keys): shown as selected. */
    selected?: boolean;
    children?: Snippet;
  }

  let {
    variant = 'secondary',
    size = 'md',
    icon,
    block = false,
    selected = false,
    children,
    class: className = '',
    type = 'button',
    ...rest
  }: Props = $props();
</script>

<button
  {type}
  class="btn {variant} {size} {className}"
  class:block
  class:selected
  class:icon-only={!children}
  {...rest}
  {@attach pressable}
>
  {#if icon}
    {@const Icon = icon}
    <Icon size={size === 'lg' ? 28 : 22} strokeWidth={2.2} aria-hidden="true" />
  {/if}
  {#if children}<span class="label">{@render children()}</span>{/if}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-2);
    min-width: var(--touch);
    min-height: var(--touch);
    padding: 0 var(--sp-4);
    border: 1px solid transparent;
    border-radius: var(--r-md);
    background: var(--surface-2);
    color: var(--text);
    font-size: var(--fs-md);
    font-weight: var(--fw-medium);
    line-height: 1.1;
    white-space: nowrap;
    transition:
      transform var(--dur-fast) var(--ease),
      background-color var(--dur) var(--ease),
      filter var(--dur-fast) var(--ease);
  }
  .lg {
    min-height: var(--touch-lg);
    padding: 0 var(--sp-5);
    font-size: var(--fs-lg);
    border-radius: var(--r-lg);
  }
  .icon-only {
    padding: 0;
  }
  .block {
    display: flex;
    width: 100%;
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .secondary {
    border-color: var(--border);
  }
  .secondary.selected {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent-strong);
  }
  .primary {
    background: var(--accent);
    color: var(--on-accent);
    font-weight: var(--fw-bold);
  }
  .ghost {
    background: transparent;
    color: var(--text-dim);
  }
  .ghost.selected {
    color: var(--accent-strong);
  }
  .danger {
    background: var(--error);
    color: #1f0206;
    font-weight: var(--fw-bold);
  }
  .warning {
    background: var(--paused);
    color: #221a00;
    font-weight: var(--fw-bold);
  }

  .btn:active:not(:disabled),
  .btn:global([data-pressed]) {
    transform: scale(0.96);
    filter: brightness(1.18);
  }
  .ghost:active:not(:disabled),
  .ghost:global([data-pressed]) {
    background: var(--surface-2);
  }
  .btn:disabled {
    opacity: 0.38;
  }
  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
