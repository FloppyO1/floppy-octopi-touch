<script lang="ts">
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import Info from '@lucide/svelte/icons/info';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { flip } from 'svelte/animate';
  import { fly } from 'svelte/transition';
  import { t } from '../i18n/index.svelte';
  import { toast, type ToastTone } from './toast.svelte';
  import type { IconComponent } from './types';

  const ICONS: Record<ToastTone, IconComponent> = {
    info: Info,
    ok: CircleCheck,
    warning: TriangleAlert,
    error: CircleAlert,
  };
</script>

<div class="toasts" aria-live="polite">
  {#each toast.items as item (item.id)}
    {@const Icon = ICONS[item.tone]}
    <button
      type="button"
      class="toast {item.tone}"
      aria-label={`${item.message} — ${t('common.close')}`}
      onclick={() => toast.dismiss(item.id)}
      animate:flip={{ duration: 160 }}
      in:fly|global={{ y: 24, duration: 180 }}
      out:fly|global={{ y: 24, duration: 140 }}
      data-testid="toast"
    >
      <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
      <span>{item.message}</span>
    </button>
  {/each}
</div>

<style>
  .toasts {
    position: fixed;
    left: 50%;
    bottom: var(--sp-4);
    z-index: var(--z-toast);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    transform: translateX(-50%);
    pointer-events: none;
  }
  .toast {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: var(--touch);
    max-width: 720px;
    padding: var(--sp-2) var(--sp-5);
    border: 1px solid var(--border);
    border-radius: var(--r-pill);
    background: var(--surface-3);
    box-shadow: var(--shadow-2);
    font-size: var(--fs-md);
    font-weight: var(--fw-medium);
    text-align: left;
    pointer-events: auto;
  }
  .info :global(svg) {
    color: var(--accent);
  }
  .ok :global(svg) {
    color: var(--ok);
  }
  .warning :global(svg) {
    color: var(--paused);
  }
  .error {
    border-color: var(--error);
  }
  .error :global(svg) {
    color: var(--error);
  }
</style>
