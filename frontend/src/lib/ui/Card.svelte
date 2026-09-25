<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import type { IconComponent } from './types';

  interface Props extends HTMLAttributes<HTMLElement> {
    title?: string;
    icon?: IconComponent;
    /** Right side of the header (buttons, badges). */
    actions?: Snippet;
    /** Less inner padding, for dense content. */
    compact?: boolean;
    children?: Snippet;
  }

  let { title, icon, actions, compact = false, children, class: className = '', ...rest }: Props = $props();
</script>

<section class="card {className}" class:compact {...rest}>
  {#if title || actions}
    <header>
      {#if icon}
        {@const Icon = icon}
        <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
      {/if}
      {#if title}<h2>{title}</h2>{/if}
      {#if actions}<div class="actions">{@render actions()}</div>{/if}
    </header>
  {/if}
  {@render children?.()}
</section>

<style>
  .card {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-width: 0;
    padding: var(--sp-4);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--surface);
  }
  .compact {
    gap: var(--sp-2);
    padding: var(--sp-3);
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    min-height: 24px;
    color: var(--text-dim);
  }
  h2 {
    margin: 0;
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .actions {
    display: flex;
    gap: var(--sp-2);
    margin-left: auto;
  }
</style>
