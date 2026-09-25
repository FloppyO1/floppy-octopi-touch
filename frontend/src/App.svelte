<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { getAgentHealth, getConnection } from './lib/api/octoprint';
  import { OctoPrintSocket, type SocketStatus } from './lib/api/socket';
  import { latestTemperatures, type Temperatures } from './lib/api/temperatures';
  import type { AgentHealth, CurrentPayload } from './lib/api/types';
  import { i18n, t, type Locale } from './lib/i18n/index.svelte';

  let health = $state<AgentHealth | null>(null);
  let agentError = $state(false);
  let printerState = $state<string | null>(null);
  let socketStatus = $state<SocketStatus>('connecting');
  let temperatures = $state<Temperatures | null>(null);
  let updatedAt = $state<Date | null>(null);

  const clock = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const octoprintText = $derived.by(() => {
    if (agentError) return t('status.unreachable');
    if (!health) return '…';
    if (!health.apiKeyConfigured) return t('status.noApiKey');
    if (!health.octoprint.reachable) return t('status.unreachable');
    if (!health.octoprint.authorized) return t('status.unauthorized');
    return health.octoprint.version ?? '?';
  });

  const socket = new OctoPrintSocket({
    onStatus: (status) => (socketStatus = status),
    onMessage: (type, payload) => {
      if (type !== 'current' && type !== 'history') return;
      const current = payload as CurrentPayload;
      printerState = current.state?.text ?? printerState;
      const latest = latestTemperatures(current.temps);
      if (latest) {
        temperatures = latest;
        updatedAt = new Date();
      }
    },
  });

  function formatTemp(value: number | null): string {
    return value === null ? '—' : `${value.toFixed(1)} °C`;
  }

  function setLocale(locale: Locale) {
    i18n.locale = locale;
    document.documentElement.lang = locale;
  }

  onMount(async () => {
    try {
      health = await getAgentHealth();
    } catch {
      agentError = true;
      return;
    }
    if (health.octoprint.authorized) {
      try {
        printerState = (await getConnection()).current.state;
      } catch {
        /* the socket will report the state anyway */
      }
      socket.connect();
    }
  });

  onDestroy(() => socket.close());
</script>

<main>
  <header>
    <div>
      <h1>FloppyOctoTouch <span class="version">v{__APP_VERSION__}</span></h1>
      <p class="dim">{t('app.subtitle')}</p>
    </div>
    <div class="lang" role="group" aria-label={t('language')}>
      {#each ['en', 'it'] as const as locale (locale)}
        <button class:active={i18n.locale === locale} onclick={() => setLocale(locale)}>
          {locale.toUpperCase()}
        </button>
      {/each}
    </div>
  </header>

  <section class="status">
    <div class="card">
      <span class="label">{t('status.agent')}</span>
      <span class="value" class:bad={agentError}>
        {agentError ? t('status.unreachable') : (health?.version ?? '…')}
      </span>
    </div>
    <div class="card">
      <span class="label">{t('status.octoprint')}</span>
      <span class="value" class:bad={!health?.octoprint.authorized} data-testid="octoprint-version">
        {octoprintText}
      </span>
    </div>
    <div class="card">
      <span class="label">{t('status.printer')}</span>
      <span class="value" data-testid="printer-state">{printerState ?? '…'}</span>
    </div>
    <div class="card">
      <span class="label">{t('status.socket')}</span>
      <span class="value" class:good={socketStatus === 'open'} class:bad={socketStatus === 'closed'}>
        {t(`socket.${socketStatus}`)}
      </span>
    </div>
  </section>

  <section class="temps card">
    <h2>{t('temps.title')}</h2>
    {#if temperatures}
      <table data-testid="temperatures">
        <thead>
          <tr><th>{t('temps.heater')}</th><th>{t('temps.actual')}</th><th>{t('temps.target')}</th></tr>
        </thead>
        <tbody>
          {#each Object.entries(temperatures).filter(([, r]) => r.actual !== null) as [heater, reading] (heater)}
            <tr>
              <td>{t(`heater.${heater}`)}</td>
              <td class="big">{formatTemp(reading.actual)}</td>
              <td>{formatTemp(reading.target)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if updatedAt}
        <p class="dim" data-testid="updated-at">
          {t('temps.updated', { time: clock.format(updatedAt) })}
        </p>
      {/if}
    {:else}
      <p class="dim">{t('temps.none')}</p>
    {/if}
  </section>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: 1024px;
    height: 600px;
    padding: 24px 32px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  h1 {
    margin: 0;
    font-size: 30px;
  }
  h2 {
    margin: 0 0 12px;
    font-size: 20px;
  }
  .version {
    font-size: 18px;
    color: var(--text-dim);
    font-weight: 400;
  }
  .dim {
    margin: 4px 0 0;
    color: var(--text-dim);
  }
  .lang {
    display: flex;
    gap: 8px;
  }
  .lang button {
    min-width: 64px;
    min-height: 56px;
    border: 1px solid var(--surface-2);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    font-size: 18px;
    font-weight: 600;
  }
  .lang button.active {
    background: var(--surface-2);
    border-color: var(--text-dim);
  }
  .status {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 16px;
    border-radius: 14px;
    background: var(--surface);
  }
  .label {
    color: var(--text-dim);
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .value {
    font-size: 20px;
    font-weight: 600;
  }
  .good {
    color: var(--ok);
  }
  .bad {
    color: var(--error);
  }
  .temps {
    flex: 1;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 20px;
  }
  th {
    text-align: left;
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 500;
    text-transform: uppercase;
    padding-bottom: 8px;
  }
  td {
    padding: 10px 0;
    border-top: 1px solid var(--surface-2);
  }
  td.big {
    font-size: 32px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
