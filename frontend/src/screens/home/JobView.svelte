<script lang="ts">
  // Home while a job exists: preview, progress and times, live overrides, pause/resume/stop.
  import Activity from '@lucide/svelte/icons/activity';
  import Gauge from '@lucide/svelte/icons/gauge';
  import Pause from '@lucide/svelte/icons/pause';
  import Play from '@lucide/svelte/icons/play';
  import Printer from '@lucide/svelte/icons/printer';
  import Square from '@lucide/svelte/icons/square';
  import Waves from '@lucide/svelte/icons/waves';
  import { formatClock, formatDuration } from '../../lib/core/format';
  import { t } from '../../lib/i18n/index.svelte';
  import { files, job, printer, settings, tune } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import Card from '../../lib/ui/Card.svelte';
  import { askFeedrate, askFlow, pausePrint, resumePrint, stopPrint } from './actions';
  import Preview from './Preview.svelte';
  import StatusRows from './StatusRows.svelte';

  const paused = $derived(printer.phase === 'paused' || printer.phase === 'pausing');
</script>

<div class="bottom">
  <Card class="job" title={t('job.title')} icon={Printer}>
    <div class="job-body">
      <Preview thumbnail={files.thumbnailFor(job.file)} />
      <div class="job-info">
        <p class="file" data-testid="job-file">{job.file ? (job.file.display ?? job.file.name) : t('job.none')}</p>
        <div class="bar"><div class="fill" class:paused style:width="{job.completion ?? 0}%"></div></div>
        <dl class="times tabular">
          <div><dt>{t('job.elapsed')}</dt><dd>{formatDuration(job.progress?.printTime)}</dd></div>
          <div><dt>{t('job.left')}</dt><dd data-testid="job-left">{formatDuration(job.progress?.printTimeLeft)}</dd></div>
          <div><dt>{t('job.eta')}</dt><dd>{job.eta ? formatClock(job.eta, !settings.value.clock24h) : '—'}</dd></div>
        </dl>
        <div class="tune">
          <Button icon={Gauge} onclick={askFeedrate} data-testid="tune-feedrate">
            {t('tune.speedShort')}<b class="tabular">{tune.feedrate}%</b>
          </Button>
          <Button icon={Waves} onclick={askFlow} data-testid="tune-flow">
            {t('tune.flowShort')}<b class="tabular">{tune.flow}%</b>
          </Button>
        </div>
      </div>
    </div>
    <div class="actions">
      {#if paused}
        <Button variant="primary" size="lg" icon={Play} disabled={printer.phase !== 'paused'} onclick={resumePrint} data-testid="job-resume">
          {t('job.resume')}
        </Button>
      {:else}
        <Button variant="warning" size="lg" icon={Pause} disabled={printer.phase !== 'printing'} onclick={pausePrint} data-testid="job-pause">
          {t('job.pause')}
        </Button>
      {/if}
      <Button variant="danger" size="lg" icon={Square} disabled={printer.phase === 'cancelling'} onclick={stopPrint} data-testid="job-stop">
        {t('job.stop')}
      </Button>
    </div>
  </Card>

  <Card class="status" title={t('home.status')} icon={Activity}>
    <StatusRows />
  </Card>
</div>

<style>
  .bottom {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: var(--sp-3);
  }
  .job-body {
    display: flex;
    gap: var(--sp-4);
    flex: 1;
    min-height: 0;
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
  .tune {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-2);
  }
  .tune :global(.label) {
    display: flex;
    gap: var(--sp-2);
  }
  .tune b {
    color: var(--accent-strong);
  }
  .actions {
    display: flex;
    gap: var(--sp-3);
  }
  .actions :global(.btn) {
    flex: 1;
  }
</style>
