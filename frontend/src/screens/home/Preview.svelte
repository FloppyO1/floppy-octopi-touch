<script lang="ts">
  // Job preview on the Home screen: the file's thumbnail or the webcam (persisted choice), with a
  // corner button to switch and a tap to see it large.
  import Box from '@lucide/svelte/icons/box';
  import Image from '@lucide/svelte/icons/image';
  import Video from '@lucide/svelte/icons/video';
  import type { HomePreview } from '../../lib/core/settings';
  import { t } from '../../lib/i18n/index.svelte';
  import { idle, server, settings } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import Modal from '../../lib/ui/Modal.svelte';
  import { pressable } from '../../lib/ui/press';
  import WebcamView from '../../lib/ui/WebcamView.svelte';

  interface Props {
    thumbnail: string | null;
    width?: number;
    height?: number;
  }

  let { thumbnail, width = 200, height = 150 }: Props = $props();

  let expanded = $state(false);
  let thumbFailed = $state(false);
  $effect(() => {
    void thumbnail;
    thumbFailed = false;
  });

  const webcam = $derived(server.webcam);
  const mode = $derived<HomePreview>(webcam ? settings.value.home.preview : 'thumbnail');
  // Nothing streams under the screensaver or while the screen is off.
  const awake = $derived(idle.mode === 'active');

  function choose(preview: HomePreview) {
    settings.update((s) => (s.home.preview = preview));
  }
</script>

{#snippet content(large: boolean)}
  {#if mode === 'webcam'}
    <WebcamView source={webcam} active={awake} fit={large ? 'contain' : 'cover'} />
  {:else if thumbnail && !thumbFailed}
    <img src={thumbnail} alt={t('preview.thumbnail')} onerror={() => (thumbFailed = true)} />
  {:else}
    <div class="empty">
      <Box size={large ? 96 : 48} strokeWidth={1.4} aria-hidden="true" />
      {#if large}<span>{t('preview.noThumbnail')}</span>{/if}
    </div>
  {/if}
{/snippet}

<div class="preview" style:width="{width}px" style:height="{height}px">
  <button
    type="button"
    class="surface"
    aria-label={t('preview.enlarge')}
    onclick={() => (expanded = true)}
    data-testid="preview"
    data-mode={mode}
    {@attach pressable}
  >
    {@render content(false)}
  </button>
  {#if webcam}
    <div class="switch">
      <IconButton
        icon={mode === 'webcam' ? Image : Video}
        label={t(mode === 'webcam' ? 'preview.showThumbnail' : 'preview.showWebcam')}
        onclick={() => choose(mode === 'webcam' ? 'thumbnail' : 'webcam')}
        data-testid="preview-toggle"
      />
    </div>
  {/if}
</div>

{#if expanded}
  <Modal
    title={t(mode === 'webcam' ? 'webcam.title' : 'preview.thumbnail')}
    icon={mode === 'webcam' ? Video : Image}
    width={880}
    onclose={() => (expanded = false)}
    testid="preview-modal"
  >
    <div class="large">{@render content(true)}</div>
    {#snippet actions()}
      {#if webcam}
        <Button selected={mode === 'thumbnail'} size="lg" icon={Image} onclick={() => choose('thumbnail')}>
          {t('preview.thumbnail')}
        </Button>
        <Button selected={mode === 'webcam'} size="lg" icon={Video} onclick={() => choose('webcam')}>
          {t('webcam.title')}
        </Button>
      {/if}
      <Button variant="primary" size="lg" onclick={() => (expanded = false)}>{t('common.close')}</Button>
    {/snippet}
  </Modal>
{/if}

<style>
  .preview {
    position: relative;
    flex: none;
  }
  .surface {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-2);
    color: var(--text-faint);
    overflow: hidden;
    transition: transform var(--dur-fast) var(--ease);
  }
  .surface:global([data-pressed]) {
    transform: scale(0.97);
  }
  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-3);
    width: 100%;
    height: 100%;
    font-size: var(--fs-lg);
  }
  .switch {
    position: absolute;
    right: 6px;
    bottom: 6px;
  }
  .switch :global(.btn) {
    /* No backdrop blur: over the webcam it would be redrawn at every frame (costly on the Pi). */
    background: rgb(12 14 18 / 0.85);
  }
  .large {
    height: 360px;
    border-radius: var(--r-md);
    background: var(--surface-2);
    overflow: hidden;
  }
</style>
