<script lang="ts">
  // Stand-in for the screens built in later sessions.
  import Construction from '@lucide/svelte/icons/construction';
  import { t } from '../lib/i18n/index.svelte';
  import { nav } from '../lib/stores';

  const id = $derived(nav.current);
</script>

<div class="placeholder">
  <Construction size={56} strokeWidth={1.6} aria-hidden="true" />
  <h1>{t(`screen.${id}`)}</h1>
  <p>{t('screen.soon')}</p>
</div>

<style>
  .placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-3);
    height: 100%;
    color: var(--text-faint);
  }
  h1 {
    margin: 0;
    color: var(--text);
    font-size: var(--fs-2xl);
  }
  p {
    margin: 0;
    font-size: var(--fs-lg);
  }
</style>
