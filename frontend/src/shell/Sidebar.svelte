<script lang="ts">
  import { t } from '../lib/i18n/index.svelte';
  import { nav } from '../lib/stores';
  import { pressable } from '../lib/ui/press';
  import { SCREENS } from './screens';
</script>

<nav class="sidebar" aria-label={t('nav.label')}>
  {#each SCREENS as screen (screen.id)}
    {@const Icon = screen.icon}
    <button
      type="button"
      class="item"
      class:active={nav.current === screen.id}
      aria-current={nav.current === screen.id ? 'page' : undefined}
      data-testid="nav-{screen.id}"
      onclick={() => nav.go(screen.id)}
      {@attach pressable}
    >
      <Icon size={28} strokeWidth={nav.current === screen.id ? 2.4 : 2} aria-hidden="true" />
      <span>{t(`nav.${screen.id}`)}</span>
    </button>
  {/each}
</nav>

<style>
  .sidebar {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 6px;
    width: var(--sidebar-w);
    height: 100%;
    padding: var(--sp-2);
    border-right: 1px solid var(--border);
    background: var(--surface);
  }
  .item {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    height: var(--touch-lg);
    padding: 0;
    border: 0;
    border-radius: var(--r-md);
    background: none;
    color: var(--text-dim);
    font-size: 11.5px;
    font-weight: var(--fw-medium);
    transition:
      background-color var(--dur) var(--ease),
      color var(--dur) var(--ease),
      transform var(--dur-fast) var(--ease);
  }
  .item span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .item:global([data-pressed]) {
    transform: scale(0.94);
    background: var(--surface-2);
  }
  .active {
    background: var(--accent-soft);
    color: var(--accent-strong);
    font-weight: var(--fw-bold);
  }
  .active::before {
    content: '';
    position: absolute;
    left: -8px;
    top: 14px;
    bottom: 14px;
    width: 4px;
    border-radius: 0 4px 4px 0;
    background: var(--accent);
  }
</style>
