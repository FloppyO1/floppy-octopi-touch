<script lang="ts">
  // Big minimal view after the inactivity timeout (progress while printing, clock + temperatures
  // otherwise) and the black cover while the HDMI output is off. The wake-up touch is swallowed by
  // the idle store before it reaches anything, including this overlay.
  import { onMount, untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { getDisplayState, setDisplayPower } from '../lib/api/agent';
  import { formatClock, formatDuration } from '../lib/core/format';
  import { heaterTone } from '../lib/core/gauge';
  import { phaseTone } from '../lib/core/printerState';
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { clock, connection, files, idle, job, printer, settings, temperatures } from '../lib/stores';
  import { dialogs } from '../lib/ui/dialogs.svelte';

  const mode = $derived(idle.mode);
  const hour12 = $derived(!settings.value.clock24h);
  const heaters = $derived(temperatures.heaters.filter((h) => h === 'bed' || h.startsWith('tool')));
  const date = $derived(
    new Intl.DateTimeFormat(i18n.locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(clock.now),
  );
  const phase = $derived(connection.live ? t(`phase.${printer.phase}`) : t('status.offline'));
  const round = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toString());

  // Optional (default off): the file's thumbnail next to the percentage; none = the plain layout.
  const thumbnail = $derived(
    settings.value.screensaver.showThumbnail && printer.busy ? files.thumbnailFor(job.file) : null,
  );
  let thumbFailed = $state(false);
  $effect(() => {
    void thumbnail;
    thumbFailed = false;
  });

  // Open dialogs (NumPad, confirmations…) are cancelled when the screen goes to sleep.
  $effect(() => {
    if (mode !== 'active') untrack(() => dialogs.closeAll());
  });

  // A kiosk reload while the output was off must not leave the screen dark.
  onMount(() => {
    getDisplayState()
      .then((state) => (state.on || displayOff ? undefined : setDisplayPower(true)))
      .catch(() => {});
  });

  // HDMI output follows the "off" level; errors are logged by the agent. Waking up is retried: the UI
  // is already active, so a failed "on" would otherwise leave the screen dark until the next "off".
  let displayOff = false;
  async function switchDisplay(on: boolean) {
    for (let attempt = 1; ; attempt++) {
      try {
        await setDisplayPower(on);
        return;
      } catch (error) {
        if (!on || displayOff || attempt >= 3) {
          console.warn('display power', error);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
        if (displayOff) return;
      }
    }
  }
  $effect(() => {
    const off = mode === 'off';
    if (off === displayOff) return;
    displayOff = off;
    void switchDisplay(!off);
  });
</script>

{#if mode !== 'active'}
  <div class="saver" class:off={mode === 'off'} data-testid="screensaver" data-mode={mode} transition:fade={{ duration: 400 }}>
    {#if mode === 'screensaver'}
      {#if printer.busy}
        <div class="printing tone-{phaseTone(printer.phase)}">
          <div class="headline">
            {#if thumbnail && !thumbFailed}
              <img class="thumb" src={thumbnail} alt="" onerror={() => (thumbFailed = true)} data-testid="saver-thumbnail" />
            {/if}
            <div class="progress">
              <p class="phase">{phase}</p>
              <p class="percent tabular" data-testid="saver-progress">
                {job.completion === null ? '—' : job.completion.toFixed(0)}<span>%</span>
              </p>
            </div>
          </div>
          <div class="bar"><div class="fill" style:width="{job.completion ?? 0}%"></div></div>
          <p class="file">{job.file?.display ?? job.file?.name ?? ''}</p>
          <p class="times tabular">
            {t('job.left')} <b>{formatDuration(job.progress?.printTimeLeft)}</b>
            <span class="sep">·</span>
            {t('job.eta')} <b>{job.eta ? formatClock(job.eta, hour12) : '—'}</b>
          </p>
        </div>
      {:else}
        <div class="idle">
          <p class="clock tabular" data-testid="saver-clock">{formatClock(clock.now, hour12)}</p>
          <p class="date">{date}</p>
          <p class="phase tone-{connection.live ? phaseTone(printer.phase) : 'neutral'}">{phase}</p>
        </div>
      {/if}
      <div class="temps tabular">
        {#each heaters as heater (heater)}
          {@const reading = temperatures.latest[heater]}
          <span class="temp tone-{heaterTone(reading?.actual, reading?.target)}">
            <span class="name">{t(`heater.${heater}`)}</span>
            <b>{round(reading?.actual)}°</b>
            {#if reading?.target}<span class="target">/ {round(reading.target)}°</span>{/if}
          </span>
        {/each}
      </div>
      <p class="hint">{t('saver.hint')}</p>
    {/if}
  </div>
{/if}

<style>
  .saver {
    position: fixed;
    inset: 0;
    z-index: var(--z-screensaver);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-5);
    background: #000;
    color: var(--text);
    text-align: center;
  }
  p {
    margin: 0;
  }
  .tone-accent {
    --tone: var(--accent);
  }
  .tone-ok {
    --tone: var(--ok);
  }
  .tone-heating {
    --tone: var(--heating);
  }
  .tone-cooling {
    --tone: var(--cooling);
  }
  .tone-paused {
    --tone: var(--paused);
  }
  .tone-error {
    --tone: var(--error);
  }
  .tone-neutral {
    --tone: var(--idle);
  }
  .printing,
  .idle {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    width: 820px;
  }
  .headline {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--sp-6);
  }
  .progress {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
  }
  .thumb {
    width: 220px;
    height: 220px;
    object-fit: contain;
    border-radius: var(--r-lg);
    background: var(--surface);
  }
  .phase {
    color: var(--tone);
    font-size: var(--fs-2xl);
    font-weight: var(--fw-bold);
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .percent {
    color: var(--tone);
    font-size: 184px;
    font-weight: var(--fw-bold);
    line-height: 0.95;
    letter-spacing: -0.04em;
  }
  .percent span {
    font-size: 0.4em;
    color: var(--text-dim);
  }
  .bar {
    width: 100%;
    height: 14px;
    border-radius: var(--r-pill);
    background: var(--surface-2);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: inherit;
    background: var(--tone);
    transition: width 600ms var(--ease);
  }
  .file {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-dim);
    font-size: var(--fs-xl);
  }
  .times {
    font-size: var(--fs-2xl);
    color: var(--text-dim);
  }
  .times b {
    color: var(--text);
  }
  .sep {
    margin: 0 var(--sp-3);
    color: var(--text-faint);
  }
  .clock {
    font-size: 184px;
    font-weight: var(--fw-bold);
    line-height: 0.95;
    letter-spacing: -0.03em;
  }
  .date {
    color: var(--text-dim);
    font-size: var(--fs-2xl);
  }
  /* "Friday 25 September" / "venerdì 25 settembre": only the first letter is raised. */
  .date::first-letter {
    text-transform: uppercase;
  }
  .idle .phase {
    margin-top: var(--sp-2);
    font-size: var(--fs-xl);
  }
  .temps {
    display: flex;
    gap: var(--sp-6);
    font-size: var(--fs-2xl);
  }
  .temp {
    display: flex;
    align-items: baseline;
    gap: var(--sp-2);
  }
  .temp .name {
    color: var(--text-dim);
    font-size: var(--fs-lg);
  }
  .temp b {
    color: var(--tone);
  }
  .temp .target {
    color: var(--text-faint);
    font-size: var(--fs-lg);
  }
  .hint {
    position: absolute;
    bottom: var(--sp-4);
    color: var(--text-faint);
    font-size: var(--fs-sm);
  }
</style>
