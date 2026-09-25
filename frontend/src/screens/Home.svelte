<script lang="ts">
  // First version of Home (session 3): gauges, job summary and status rows on live data.
  // Session 4 completes it (thumbnail/webcam, feedrate/flow/fan controls, idle view).
  import Activity from '@lucide/svelte/icons/activity';
  import Box from '@lucide/svelte/icons/box';
  import Fan from '@lucide/svelte/icons/fan';
  import Flame from '@lucide/svelte/icons/flame';
  import Heater from '@lucide/svelte/icons/heater';
  import Layers from '@lucide/svelte/icons/layers';
  import Link2 from '@lucide/svelte/icons/link-2';
  import Pause from '@lucide/svelte/icons/pause';
  import Play from '@lucide/svelte/icons/play';
  import Printer from '@lucide/svelte/icons/printer';
  import Square from '@lucide/svelte/icons/square';
  import { formatClock, formatDuration, formatTemp } from '../lib/core/format';
  import { heaterTone } from '../lib/core/gauge';
  import { phaseTone } from '../lib/core/printerState';
  import { t } from '../lib/i18n/index.svelte';
  import { connection, job, printer, server, settings, temperatures } from '../lib/stores';
  import Button from '../lib/ui/Button.svelte';
  import Card from '../lib/ui/Card.svelte';
  import { dialogs } from '../lib/ui/dialogs.svelte';
  import InfoRow from '../lib/ui/InfoRow.svelte';
  import RingGauge from '../lib/ui/RingGauge.svelte';
  import { askHeaterTarget } from './heaterTarget';

  const hotend = $derived(temperatures.latest.tool0);
  const bed = $derived(temperatures.latest.bed);
  const limits = $derived(settings.value.temperature.max);
  const paused = $derived(printer.phase === 'paused' || printer.phase === 'pausing');
  const targetText = (target: number | null | undefined) =>
    target ? t('gauge.target', { value: formatTemp(target) }) : t('gauge.off');

  async function stop() {
    const ok = await dialogs.confirm({
      title: t('job.stopTitle'),
      message: t('job.stopMessage'),
      confirmLabel: t('job.stop'),
      tone: 'danger',
    });
    if (ok) await job.cancel();
  }
</script>

<div class="home">
  <Card class="gauges">
    <RingGauge
      label={t('heater.tool0')}
      icon={Flame}
      value={hotend?.actual}
      target={hotend?.target}
      max={limits.hotend}
      unit="°"
      sublabel={targetText(hotend?.target)}
      tone={heaterTone(hotend?.actual, hotend?.target)}
      onclick={() => askHeaterTarget('tool0')}
      testid="gauge-hotend"
    />
    <RingGauge
      label={t('heater.bed')}
      icon={Heater}
      value={bed?.actual}
      target={bed?.target}
      max={limits.bed}
      unit="°"
      sublabel={targetText(bed?.target)}
      tone={heaterTone(bed?.actual, bed?.target)}
      unavailable={!bed}
      onclick={() => askHeaterTarget('bed')}
      testid="gauge-bed"
    />
    <RingGauge label={t('gauge.fan')} icon={Fan} value={null} unit="%" unavailable sublabel={t('gauge.soon')} />
    <RingGauge
      label={t('gauge.job')}
      icon={Box}
      value={job.completion}
      unit="%"
      tone={paused ? 'paused' : 'accent'}
      sublabel={job.file ? formatDuration(job.progress?.printTimeLeft) : t('gauge.noJob')}
      unavailable={job.completion === null}
      testid="gauge-job"
    />
    {#if server.plugins.displayLayerProgress}
      <RingGauge label={t('gauge.layer')} icon={Layers} value={null} unit="%" unavailable />
    {/if}
  </Card>

  <div class="bottom">
    <Card class="job" title={t('job.title')} icon={Printer}>
      <div class="job-body">
        <div class="thumb" aria-hidden="true"><Box size={48} strokeWidth={1.4} /></div>
        <div class="job-info">
          <p class="file" data-testid="job-file">{job.file ? (job.file.display ?? job.file.name) : t('job.none')}</p>
          <div class="bar"><div class="fill" class:paused style:width="{job.completion ?? 0}%"></div></div>
          <dl class="times tabular">
            <div><dt>{t('job.elapsed')}</dt><dd>{formatDuration(job.progress?.printTime)}</dd></div>
            <div><dt>{t('job.left')}</dt><dd>{formatDuration(job.progress?.printTimeLeft)}</dd></div>
            <div><dt>{t('job.eta')}</dt><dd>{job.eta ? formatClock(job.eta, !settings.value.clock24h) : '—'}</dd></div>
          </dl>
        </div>
      </div>
      <div class="actions">
        {#if paused}
          <Button variant="primary" size="lg" icon={Play} onclick={() => job.resume()}>{t('job.resume')}</Button>
        {:else}
          <Button variant="warning" size="lg" icon={Pause} disabled={printer.phase !== 'printing'} onclick={() => job.pause()}>
            {t('job.pause')}
          </Button>
        {/if}
        <Button variant="danger" size="lg" icon={Square} disabled={!printer.busy} onclick={stop}>{t('job.stop')}</Button>
      </div>
    </Card>

    <Card class="status" title={t('home.status')} icon={Activity}>
      <InfoRow
        icon={Printer}
        label={t('home.state')}
        value={printer.state?.text ?? '—'}
        tone={phaseTone(printer.phase)}
        testid="home-state"
      />
      <InfoRow icon={Box} label={t('home.profile')} value={server.profile?.name ?? '—'} tone="accent" />
      <InfoRow
        icon={Link2}
        label={t('home.connection')}
        value={connection.info?.current.port
          ? `${connection.info.current.port} @ ${connection.info.current.baudrate ?? '—'}`
          : '—'}
        tone={printer.operational ? 'ok' : 'neutral'}
      />
    </Card>
  </div>
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    height: 100%;
    padding: var(--sp-3);
  }
  .home :global(.gauges) {
    flex-direction: row;
    justify-content: space-around;
    align-items: center;
    padding: var(--sp-3) var(--sp-2);
  }
  .bottom {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 300px;
    gap: var(--sp-3);
  }
  .job-body {
    display: flex;
    gap: var(--sp-4);
    flex: 1;
    min-height: 0;
  }
  .thumb {
    display: grid;
    place-items: center;
    flex: none;
    width: 120px;
    height: 120px;
    border-radius: var(--r-md);
    background: var(--surface-2);
    color: var(--text-faint);
  }
  .job-info {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    flex: 1;
    min-width: 0;
  }
  .file {
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--fs-lg);
    font-weight: var(--fw-bold);
  }
  .bar {
    height: 10px;
    border-radius: var(--r-pill);
    background: var(--surface-3);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    transition: width 600ms var(--ease);
  }
  .fill.paused {
    background: var(--paused);
  }
  .times {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-3);
    margin: 0;
  }
  dt {
    font-size: var(--fs-xs);
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  dd {
    margin: 0;
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
  }
  .actions {
    display: flex;
    gap: var(--sp-3);
  }
  .actions :global(.btn) {
    flex: 1;
  }
</style>
