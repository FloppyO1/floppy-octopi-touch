<script lang="ts">
  // Big popup for the end of a print (done / failed) and for pauses or cancels not made here.
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import CircleX from '@lucide/svelte/icons/circle-x';
  import OctagonX from '@lucide/svelte/icons/octagon-x';
  import Pause from '@lucide/svelte/icons/pause';
  import Play from '@lucide/svelte/icons/play';
  import { formatDuration } from '../lib/core/format';
  import type { Notice, NoticeKind } from '../lib/core/notices';
  import { t } from '../lib/i18n/index.svelte';
  import { job, notices, printer } from '../lib/stores';
  import Button from '../lib/ui/Button.svelte';
  import Modal from '../lib/ui/Modal.svelte';
  import { toast } from '../lib/ui/toast.svelte';
  import type { IconComponent } from '../lib/ui/types';

  interface Props {
    notice: Notice;
  }

  let { notice }: Props = $props();

  const LOOK: Record<NoticeKind, { icon: IconComponent; tone: string }> = {
    done: { icon: CircleCheck, tone: 'ok' },
    failed: { icon: CircleX, tone: 'error' },
    cancelled: { icon: OctagonX, tone: 'error' },
    paused: { icon: Pause, tone: 'paused' },
  };
  const look = $derived(LOOK[notice.kind]);
  const Icon = $derived(look.icon);

  async function resume() {
    notices.dismiss();
    try {
      await job.resume();
    } catch {
      toast.show(t('job.failed'), { tone: 'error' });
    }
  }
</script>

<Modal width={600} layer="top" testid="notice" onclose={() => notices.dismiss()}>
  <div class="notice tone-{look.tone}" data-kind={notice.kind}>
    <span class="icon"><Icon size={88} strokeWidth={1.8} aria-hidden="true" /></span>
    <h2>{t(`notice.${notice.kind}`)}</h2>
    {#if notice.file}<p class="file">{notice.file}</p>{/if}
    {#if notice.time !== null && notice.kind !== 'paused'}
      <p class="time tabular">{t('notice.duration', { time: formatDuration(notice.time) })}</p>
    {/if}
    <p class="hint">{t(`notice.${notice.kind}Hint`)}</p>
  </div>
  {#snippet actions()}
    {#if notice.kind === 'paused'}
      <Button variant="primary" size="lg" icon={Play} disabled={printer.phase !== 'paused'} onclick={resume}>
        {t('job.resume')}
      </Button>
    {/if}
    <Button variant={notice.kind === 'paused' ? 'secondary' : 'primary'} size="lg" onclick={() => notices.dismiss()} data-testid="notice-ok">
      {t('common.ok')}
    </Button>
  {/snippet}
</Modal>

<style>
  .notice {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    padding-top: var(--sp-3);
    text-align: center;
  }
  .tone-ok {
    --tone: var(--ok);
  }
  .tone-error {
    --tone: var(--error);
  }
  .tone-paused {
    --tone: var(--paused);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 128px;
    height: 128px;
    margin-bottom: var(--sp-2);
    border-radius: 50%;
    background: color-mix(in srgb, var(--tone) 14%, transparent);
    color: var(--tone);
  }
  h2 {
    margin: 0;
    color: var(--text);
    font-size: var(--fs-3xl);
  }
  p {
    margin: 0;
  }
  .file {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text);
    font-size: var(--fs-xl);
    font-weight: var(--fw-medium);
  }
  .time {
    font-size: var(--fs-lg);
  }
  .hint {
    color: var(--text-faint);
    font-size: var(--fs-md);
  }
</style>
