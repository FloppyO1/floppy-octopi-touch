<script lang="ts">
  // MJPEG stream in an <img> (camera-streamer / mjpg-streamer). The connection only exists while the
  // component is mounted and `active`: the screensaver and hidden screens must not keep it open.
  import VideoOff from '@lucide/svelte/icons/video-off';
  import { onDestroy } from 'svelte';
  import { streamHealth, webcamTransform, type WebcamSource } from '../core/webcam';
  import { t } from '../i18n/index.svelte';

  interface Props {
    source: WebcamSource | null;
    active?: boolean;
    /** Small previews crop to fill, large views show the whole frame. */
    fit?: 'cover' | 'contain';
    testid?: string;
  }

  let { source, active = true, fit = 'cover', testid }: Props = $props();

  const RETRY_MS = 10_000;
  const CHECK_MS = 2000;
  let failed = $state(false);
  let attempt = $state(0);
  let timer: ReturnType<typeof setTimeout> | null = null;

  const url = $derived.by(() => {
    if (!source || !active || failed) return null;
    if (attempt === 0) return source.stream;
    // Retry: a new URL makes the browser open a new connection.
    return `${source.stream}${source.stream.includes('?') ? '&' : '?'}retry=${attempt}`;
  });

  // Once an MJPEG stream has started Chromium reports nothing, even when it ends or stalls: without
  // this check a restarted or stuck streamer leaves a frozen frame forever (see streamHealth).
  let img = $state<HTMLImageElement | null>(null);
  let loaded = false;
  $effect(() => {
    if (!url) return;
    loaded = false;
    const since = performance.now();
    const check = setInterval(() => {
      if (!img) return;
      const health = streamHealth({ loaded, naturalWidth: img.naturalWidth, sinceMs: performance.now() - since });
      // A broken stream reconnects at once (a restarted streamer is usually back); if it is still
      // down, the error path waits RETRY_MS.
      if (health === 'lost') attempt++;
      else if (health === 'stuck') onerror();
    }, CHECK_MS);
    return () => clearInterval(check);
  });

  function onerror() {
    failed = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      attempt++;
      failed = false;
    }, RETRY_MS);
  }

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });
</script>

<div class="webcam" class:contain={fit === 'contain'} data-testid={testid}>
  {#if url && source}
    <img
      src={url}
      alt={t('webcam.title')}
      style:transform={webcamTransform(source)}
      style:object-fit={fit}
      bind:this={img}
      onload={() => (loaded = true)}
      {onerror}
      data-testid="webcam-stream"
    />
  {:else if active}
    <div class="missing" data-testid="webcam-missing">
      <VideoOff size={fit === 'contain' ? 48 : 32} strokeWidth={1.6} aria-hidden="true" />
      <span>{t(source ? 'webcam.unreachable' : 'webcam.none')}</span>
    </div>
  {/if}
</div>

<style>
  .webcam {
    position: relative;
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
  }
  img {
    /* Absolute: a percentage height would not resolve inside the auto-sized grid row. */
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
  }
  .missing {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--sp-2);
    padding: var(--sp-3);
    color: var(--text-faint);
    font-size: var(--fs-sm);
    text-align: center;
  }
  /* Small previews: keep the text clear of the corner switch button. */
  .webcam:not(.contain) .missing {
    align-self: start;
    padding-top: var(--sp-4);
  }
  .contain .missing {
    font-size: var(--fs-lg);
  }
</style>
