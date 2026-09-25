<script lang="ts">
  // Covers printer screens while the serial connection is down, with a Connect form (port/baud from OctoPrint).
  import Plug from '@lucide/svelte/icons/plug';
  import PrinterX from '@lucide/svelte/icons/printer-x';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import { onMount } from 'svelte';
  import { t } from '../lib/i18n/index.svelte';
  import { connection, printer } from '../lib/stores';
  import Button from '../lib/ui/Button.svelte';
  import IconButton from '../lib/ui/IconButton.svelte';
  import Select from '../lib/ui/Select.svelte';
  import Spinner from '../lib/ui/Spinner.svelte';
  import { toast } from '../lib/ui/toast.svelte';
  import type { Option } from '../lib/ui/types';

  const AUTO = 'AUTO';
  let port = $state(AUTO);
  let baudrate = $state(0);
  let busy = $state(false);
  let initialised = false;

  const options = $derived(connection.info?.options);
  const portOptions = $derived<Option<string>[]>([
    { value: AUTO, label: t('printer.auto') },
    ...(options?.ports ?? []).map((p) => ({ value: p, label: p })),
  ]);
  const baudOptions = $derived<Option<number>[]>([
    { value: 0, label: t('printer.auto') },
    ...(options?.baudrates ?? []).map((b) => ({ value: b, label: String(b) })),
  ]);

  // Start from OctoPrint's saved preferences once they are known.
  $effect(() => {
    if (!options || initialised) return;
    initialised = true;
    if (options.portPreference && options.ports.includes(options.portPreference)) port = options.portPreference;
    if (options.baudratePreference) baudrate = options.baudratePreference;
  });

  onMount(() => void connection.refresh());

  const connecting = $derived(printer.phase === 'connecting');
  const isError = $derived(printer.phase === 'error' || /error/i.test(printer.state?.text ?? ''));
  const detail = $derived(printer.state?.error || printer.state?.text || '');

  async function connect() {
    busy = true;
    try {
      await connection.connect({ port, baudrate });
    } catch {
      toast.show(t('printer.connectFailed'), { tone: 'error' });
    } finally {
      busy = false;
    }
  }
</script>

<div class="overlay" data-testid="printer-overlay">
  <div class="card">
    {#if connecting}
      <Spinner size={56} />
      <h2>{t('printer.connecting')}</h2>
      {#if detail}<p class="detail">{detail}</p>{/if}
    {:else}
      <span class="icon" class:error={isError}><PrinterX size={44} aria-hidden="true" /></span>
      <h2>{t(isError ? 'printer.error' : 'printer.disconnected')}</h2>
      {#if detail}<p class="detail" data-testid="printer-detail">{detail}</p>{/if}
      <div class="form">
        <Select label={t('printer.port')} bind:value={port} options={portOptions} testid="printer-port" />
        <Select label={t('printer.baudrate')} bind:value={baudrate} options={baudOptions} testid="printer-baud" />
        <IconButton icon={RefreshCw} label={t('printer.refreshPorts')} onclick={() => connection.refresh()} />
      </div>
      <Button variant="primary" size="lg" icon={Plug} disabled={busy} onclick={connect} data-testid="printer-connect">
        {t('printer.connect')}
      </Button>
    {/if}
  </div>
</div>

<style>
  .overlay {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: grid;
    place-items: center;
    background: rgb(12 14 18 / 0.9);
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-4);
    width: 620px;
    padding: var(--sp-6);
    border: 1px solid var(--border);
    border-radius: var(--r-xl);
    background: var(--surface);
    box-shadow: var(--shadow-2);
    text-align: center;
  }
  .icon {
    color: var(--idle);
  }
  .icon.error {
    color: var(--error);
  }
  h2 {
    margin: 0;
    font-size: var(--fs-2xl);
  }
  .detail {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--fs-md);
  }
  .form {
    display: grid;
    grid-template-columns: 1fr 1fr auto;
    align-items: end;
    gap: var(--sp-3);
    width: 100%;
    text-align: left;
  }
</style>
