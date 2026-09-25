<script lang="ts">
  import X from '@lucide/svelte/icons/x';
  import type { Snippet } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade, scale } from 'svelte/transition';
  import { t } from '../i18n/index.svelte';
  import IconButton from './IconButton.svelte';
  import type { IconComponent } from './types';

  interface Props {
    title?: string;
    icon?: IconComponent;
    /** Colours the header icon. */
    tone?: 'default' | 'accent' | 'danger' | 'warning';
    /** When set, a close button is shown and a tap on the backdrop closes the modal. */
    onclose?: () => void;
    width?: number;
    /** Above the on-screen keyboard layer (dialogs opened from the keyboard sheet). */
    layer?: 'modal' | 'top';
    testid?: string;
    children: Snippet;
    /** Buttons at the bottom. */
    actions?: Snippet;
  }

  let {
    title,
    icon,
    tone = 'default',
    onclose,
    width = 560,
    layer = 'modal',
    testid,
    children,
    actions,
  }: Props = $props();

  // A tap on the backdrop closes only if it also started there (no accidental closes while dragging a slider).
  let downOnBackdrop = false;
  const backdropDown = (event: PointerEvent) => (downOnBackdrop = event.target === event.currentTarget);
  function backdropClick(event: MouseEvent) {
    if (downOnBackdrop && event.target === event.currentTarget) onclose?.();
    downOnBackdrop = false;
  }
  function keydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && onclose) onclose();
  }
</script>

<svelte:window onkeydown={keydown} />

<div
  class="backdrop"
  class:top={layer === 'top'}
  role="presentation"
  onpointerdown={backdropDown}
  onclick={backdropClick}
  transition:fade|global={{ duration: 120 }}
>
  <div
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-label={title}
    data-testid={testid}
    style:width="{width}px"
    transition:scale|global={{ start: 0.95, duration: 160, easing: cubicOut }}
  >
    {#if title || onclose}
      <header>
        {#if icon}
          {@const Icon = icon}
          <span class="icon {tone}"><Icon size={26} strokeWidth={2.2} aria-hidden="true" /></span>
        {/if}
        <h2>{title ?? ''}</h2>
        {#if onclose}
          <IconButton icon={X} label={t('common.close')} variant="ghost" onclick={onclose} />
        {/if}
      </header>
    {/if}
    <div class="body">{@render children()}</div>
    {#if actions}<footer>{@render actions()}</footer>{/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: grid;
    place-items: center;
    padding: var(--sp-4);
    background: var(--backdrop);
  }
  .top {
    z-index: var(--z-blocking);
  }
  .modal {
    display: flex;
    flex-direction: column;
    max-width: 100%;
    max-height: 100%;
    border: 1px solid var(--border);
    border-radius: var(--r-xl);
    background: var(--surface);
    box-shadow: var(--shadow-2);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: 64px;
    padding: var(--sp-2) var(--sp-2) 0 var(--sp-5);
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
  }
  .icon {
    display: grid;
    place-items: center;
    color: var(--text-dim);
  }
  .icon.accent {
    color: var(--accent);
  }
  .icon.danger {
    color: var(--error);
  }
  .icon.warning {
    color: var(--paused);
  }
  .body {
    flex: 1;
    min-height: 0;
    padding: var(--sp-3) var(--sp-5) var(--sp-5);
    overflow-y: auto;
    color: var(--text-dim);
    font-size: var(--fs-lg);
  }
  footer {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-3);
    padding: 0 var(--sp-5) var(--sp-5);
  }
  footer :global(.btn) {
    min-width: 140px;
  }
</style>
