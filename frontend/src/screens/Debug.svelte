<script lang="ts">
  // Temporary page (session 2): shows every store to verify the data layer against OctoPrint.
  // Replaced by the real shell and screens from session 3 on.
  import { onDestroy } from 'svelte';
  import { printer as printerApi } from '../lib/api/octoprint';
  import { CAPABILITY_KEYS, type CapabilityOverride } from '../lib/core/capabilities';
  import { formatBytes, formatClock, formatDuration, formatTemp } from '../lib/core/format';
  import { PLUGIN_IDS, type PluginKey } from '../lib/core/printerState';
  import { LANGUAGES } from '../lib/core/settings';
  import { i18n, t } from '../lib/i18n/index.svelte';
  import {
    capabilities,
    connection,
    events,
    files,
    job,
    printer,
    prompt,
    server,
    settings,
    temperatures,
    terminal,
  } from '../lib/stores';

  let now = $state(new Date());
  const tick = setInterval(() => (now = new Date()), 1000);
  onDestroy(() => clearInterval(tick));

  const octoprintText = $derived.by(() => {
    const agent = connection.agent;
    if (connection.agentError) return t('status.unreachable');
    if (!agent) return '…';
    if (!agent.apiKeyConfigured) return t('status.noApiKey');
    if (!agent.octoprint.reachable) return t('status.unreachable');
    if (!agent.octoprint.authorized) return t('status.unauthorized');
    return connection.server?.display_version ?? agent.octoprint.version ?? '?';
  });

  const activeFlags = $derived(
    Object.entries(printer.state?.flags ?? {})
      .filter(([, on]) => on)
      .map(([flag]) => flag),
  );

  const OVERRIDES: CapabilityOverride[] = ['auto', 'on', 'off'];
  function cyclePromptOverride() {
    settings.update((s) => {
      const current = s.capabilities.overrides.promptSupport;
      s.capabilities.overrides.promptSupport = OVERRIDES[(OVERRIDES.indexOf(current) + 1) % 3];
    });
  }

  // Virtual Printer debug commands emit real `//action:` lines on the serial line.
  const testPrompt = () =>
    printerApi.command([
      '!!DEBUG:action_custom prompt_begin Filament runout detected',
      '!!DEBUG:action_custom prompt_choice Continue',
      '!!DEBUG:action_custom prompt_choice Purge more',
      '!!DEBUG:action_custom prompt_show',
    ]);
  const testNotification = () =>
    printerApi.command('!!DEBUG:action_custom notification Heating done');

  const pluginKeys = Object.keys(PLUGIN_IDS) as PluginKey[];
  const yesNo = (v: boolean | null) => (v === null ? '—' : v ? t('yes') : t('no'));
</script>

<main>
  <header>
    <div>
      <h1>FloppyOctoTouch <span class="dim">v{__APP_VERSION__}</span></h1>
      <p class="dim">{t('app.subtitle')}</p>
    </div>
    <div class="clock" data-testid="clock">{formatClock(now, !settings.value.clock24h, true)}</div>
    <div class="row" role="group" aria-label={t('language')}>
      {#each LANGUAGES as locale (locale)}
        <button class:active={i18n.locale === locale} onclick={() => settings.setLanguage(locale)}>
          {locale.toUpperCase()}
        </button>
      {/each}
    </div>
  </header>

  <div class="grid">
    <section class="card">
      <h2>{t('debug.connection')}</h2>
      <dl>
        <dt>{t('status.agent')}</dt>
        <dd class:bad={connection.agentError}>
          {connection.agentError ? t('status.unreachable') : (connection.agent?.version ?? '…')}
        </dd>
        <dt>{t('status.octoprint')}</dt>
        <dd class:bad={!connection.authorized} data-testid="octoprint-version">{octoprintText}</dd>
        <dt>{t('status.socket')}</dt>
        <dd class:good={connection.live} data-testid="socket-status">{t(`socket.${connection.socket}`)}</dd>
        <dt>{t('debug.port')}</dt>
        <dd>
          {connection.info?.current.port ?? '—'} @ {connection.info?.current.baudrate ?? '—'}
        </dd>
        <dt>{t('debug.profile')}</dt>
        <dd>{server.profile?.name ?? '—'}</dd>
      </dl>
      <div class="row">
        <button onclick={() => connection.connect()} disabled={printer.operational}>
          {t('debug.connect')}
        </button>
        <button onclick={() => connection.disconnect()} disabled={!printer.operational || printer.busy}>
          {t('debug.disconnect')}
        </button>
      </div>
    </section>

    <section class="card">
      <h2>{t('debug.printerState')}</h2>
      <p class="big" data-testid="printer-phase">{t(`phase.${printer.phase}`)}</p>
      <p class="dim" data-testid="printer-state">{printer.state?.text ?? '…'}</p>
      <dl>
        <dt>{t('debug.flags')}</dt>
        <dd class="small">{activeFlags.join(', ') || t('none')}</dd>
        <dt>Z</dt>
        <dd>{printer.currentZ ?? '—'}</dd>
      </dl>
      <h2>{t('debug.job')}</h2>
      {#if job.file}
        <p class="small">{job.file.display ?? job.file.name}</p>
        <dl>
          <dt>{t('debug.progress')}</dt>
          <dd>{job.completion?.toFixed(1) ?? '—'} %</dd>
          <dt>⏱</dt>
          <dd>{formatDuration(job.progress?.printTime)} / {formatDuration(job.progress?.printTimeLeft)}</dd>
          <dt>{t('debug.eta')}</dt>
          <dd>{job.eta ? formatClock(job.eta, !settings.value.clock24h) : '—'}</dd>
        </dl>
      {:else}
        <p class="dim">{t('debug.noJob')}</p>
      {/if}
    </section>

    <section class="card">
      <h2>{t('temps.title')}</h2>
      {#if temperatures.heaters.length}
        <dl data-testid="temperatures">
          {#each temperatures.heaters as heater (heater)}
            <dt>{t(`heater.${heater}`)}</dt>
            <dd>
              <span class="big">{formatTemp(temperatures.latest[heater]?.actual, 1)}</span>
              <span class="dim">{t('temps.target', { value: formatTemp(temperatures.latest[heater]?.target) })}</span>
            </dd>
          {/each}
        </dl>
        <p class="dim" data-testid="temp-samples">
          {t('temps.samples', { count: temperatures.revision >= 0 ? temperatures.history.length : 0 })}
        </p>
      {:else}
        <p class="dim">{t('temps.none')}</p>
      {/if}
      <div class="row wrap">
        {#each settings.value.presets.slice(0, 2) as preset (preset.id)}
          <button
            disabled={!printer.operational}
            onclick={() =>
              Promise.all([
                temperatures.setTarget('tool0', preset.hotend),
                temperatures.setTarget('bed', preset.bed),
              ])}
          >
            {t('temps.preset', { name: preset.name })}
          </button>
        {/each}
        <button disabled={!printer.operational} onclick={() => temperatures.allOff()}>{t('temps.off')}</button>
      </div>
    </section>

    <section class="card">
      <h2>{t('debug.firmware')}</h2>
      <p class="small" data-testid="firmware-name">{capabilities.report.firmwareName ?? t('unknown')}</p>
      <h2>{t('debug.capabilities')}</h2>
      <table class="small" data-testid="capabilities">
        <tbody>
          {#each CAPABILITY_KEYS as key (key)}
            {@const cap = capabilities.resolved[key]}
            <tr class:on={cap.enabled}>
              <td>{key}</td>
              <td>{yesNo(cap.detected)}</td>
              <td>{cap.override}</td>
              <td>{cap.enabled ? '●' : '○'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <button onclick={() => printerApi.command('M115')} disabled={!printer.operational}>
        {t('debug.sendM115')}
      </button>
    </section>

    <section class="card">
      <h2>{t('debug.prompt')}</h2>
      <dl>
        <dt>{t('debug.promptEnabled')}</dt>
        <dd data-testid="prompt-enabled">{yesNo(prompt.enabled)}</dd>
      </dl>
      {#if prompt.active}
        <div class="prompt" data-testid="prompt">
          <p>{prompt.active.text}</p>
          <div class="row wrap">
            {#each prompt.active.choices as choice, index (index)}
              <button class="accent" onclick={() => prompt.answer(index)}>{choice}</button>
            {/each}
          </div>
        </div>
      {/if}
      <div class="row wrap">
        <button onclick={cyclePromptOverride}>
          {t('debug.promptOverride', { value: settings.value.capabilities.overrides.promptSupport })}
        </button>
        <button onclick={testPrompt} disabled={!printer.operational}>{t('debug.testPrompt')}</button>
        <button onclick={testNotification} disabled={!printer.operational}>
          {t('debug.testNotification')}
        </button>
      </div>
      {#if prompt.notifications.length}
        <h2>{t('debug.notifications')}</h2>
        <ul class="small" data-testid="notifications">
          {#each prompt.notifications.slice(0, 3) as n (n.id)}
            <li>{formatClock(new Date(n.time), false, true)} — {n.message}</li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="card">
      <h2>{t('debug.files')}</h2>
      <p data-testid="files-summary">
        {t('debug.filesSummary', {
          local: files.local.length,
          sd: printer.sdReady ? files.sdcard.length : '—',
          usb: files.usbStatus === 'ready' ? files.usb.length : t(`usb.${files.usbStatus}`),
        })}
      </p>
      <ul class="small">
        {#each files.local.slice(0, 5) as entry (entry.path)}
          <li>{entry.type === 'folder' ? '📁 ' : ''}{entry.display}</li>
        {/each}
      </ul>
      <dl>
        <dt>{t('debug.freeSpace')}</dt>
        <dd>{formatBytes(files.free)}</dd>
      </dl>
      <button onclick={() => files.refresh()}>{t('debug.refresh')}</button>
      <h2>{t('debug.plugins')}</h2>
      <ul class="small" data-testid="plugins">
        {#each pluginKeys as key (key)}
          <li class:dim={!server.plugins[key]}>{server.plugins[key] ? '●' : '○'} {PLUGIN_IDS[key]}</li>
        {/each}
      </ul>
    </section>

    <section class="card">
      <h2>{t('debug.settings')}</h2>
      <dl>
        <dt>{t('debug.sync')}</dt>
        <dd data-testid="settings-status">{settings.status} · v{settings.value.schemaVersion}</dd>
        <dt>{t('debug.presets')}</dt>
        <dd class="small">
          {settings.value.presets.map((p) => `${p.name} ${p.hotend}/${p.bed}`).join(' · ')}
        </dd>
        <dt>{t('debug.macros')}</dt>
        <dd class="small">{settings.value.macros.map((m) => m.name).join(' · ')}</dd>
      </dl>
      <h2>{t('debug.events')}</h2>
      <ul class="small" data-testid="events">
        {#each events.recent.slice(0, 6) as event (event.id)}
          <li>{formatClock(new Date(event.time), false, true)} {event.type}</li>
        {/each}
      </ul>
    </section>

    <section class="card wide">
      <h2>{t('debug.terminal')}</h2>
      <pre data-testid="terminal">{terminal.lines
          .slice(-10)
          .map((l) => l.text)
          .join('\n')}</pre>
    </section>
  </div>
</main>

<style>
  main {
    display: flex;
    flex-direction: column;
    width: 1024px;
    height: 600px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--surface-2);
  }
  h1 {
    margin: 0;
    font-size: 22px;
  }
  h2 {
    margin: 8px 0 4px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-dim);
  }
  h2:first-child {
    margin-top: 0;
  }
  p {
    margin: 2px 0;
  }
  .clock {
    font-size: 26px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .grid {
    flex: 1;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    padding: 10px 16px 16px;
    align-items: start;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px;
    border-radius: 14px;
    background: var(--surface);
    min-width: 0;
  }
  .wide {
    grid-column: 1 / -1;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
  }
  dt {
    color: var(--text-dim);
  }
  dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  ul {
    margin: 0;
    padding-left: 18px;
  }
  table {
    border-collapse: collapse;
  }
  td {
    padding: 1px 8px 1px 0;
  }
  tr:not(.on) {
    color: var(--text-dim);
  }
  pre {
    margin: 0;
    font-size: 13px;
    white-space: pre-wrap;
    color: var(--text-dim);
  }
  .row {
    display: flex;
    gap: 8px;
  }
  .wrap {
    flex-wrap: wrap;
  }
  button {
    min-width: 64px;
    min-height: 56px;
    padding: 0 14px;
    border: 1px solid var(--surface-2);
    border-radius: 12px;
    background: var(--surface-2);
    color: var(--text);
    font-size: 16px;
    font-weight: 600;
  }
  button:active {
    filter: brightness(1.3);
  }
  button:disabled {
    opacity: 0.4;
  }
  button.active,
  button.accent {
    border-color: var(--ok);
  }
  .prompt {
    padding: 10px;
    border: 1px solid var(--warn);
    border-radius: 12px;
  }
  .big {
    font-size: 22px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .small {
    font-size: 13px;
  }
  .dim {
    color: var(--text-dim);
  }
  .good {
    color: var(--ok);
  }
  .bad {
    color: var(--error);
  }
</style>
