<script lang="ts">
  // Blocks the whole UI while OctoPrint (through the agent) is not reachable: nothing works without it.
  import { fade } from 'svelte/transition';
  import { t } from '../lib/i18n/index.svelte';
  import { connection } from '../lib/stores';
  import Spinner from '../lib/ui/Spinner.svelte';

  /** Avoids a flash of the overlay while the socket connects at startup. */
  const SHOW_DELAY_MS = 800;
  let visible = $state(false);

  $effect(() => {
    if (connection.live) {
      visible = false;
      return;
    }
    const timer = setTimeout(() => (visible = true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  });

  const reason = $derived.by(() => {
    if (connection.agentError) return 'agentDown';
    const agent = connection.agent;
    if (!agent) return 'starting';
    if (!agent.apiKeyConfigured) return 'noApiKey';
    if (!agent.octoprint.reachable) return 'octoprintDown';
    if (!agent.octoprint.authorized) return 'unauthorized';
    return 'socket';
  });
</script>

{#if visible}
  <div class="overlay" role="alertdialog" aria-live="assertive" data-testid="connection-overlay" transition:fade|global={{ duration: 200 }}>
    <div class="box">
      <div class="brand">FloppyOctoTouch</div>
      <Spinner size={56} />
      <h2>{t('overlay.connecting')}</h2>
      <p data-testid="connection-reason">{t(`overlay.${reason}`)}</p>
      <p class="hint">{t('overlay.retrying')}</p>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-connection);
    display: grid;
    place-items: center;
    background: rgb(12 14 18 / 0.94);
  }
  .box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    max-width: 640px;
    text-align: center;
  }
  .brand {
    color: var(--accent);
    font-size: var(--fs-lg);
    font-weight: var(--fw-bold);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  h2 {
    margin: 0;
    font-size: var(--fs-2xl);
  }
  p {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--fs-lg);
  }
  .hint {
    color: var(--text-faint);
    font-size: var(--fs-md);
  }
</style>
