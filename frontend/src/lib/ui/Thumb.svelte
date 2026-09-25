<script lang="ts">
  // A file thumbnail that falls back to an icon when there is none (or it fails to load: the agent
  // answers 404 for G-code without an embedded thumbnail).
  import type { IconComponent } from './types';

  interface Props {
    src: string | null;
    icon: IconComponent;
    iconSize?: number;
    alt?: string;
  }

  let { src, icon: Icon, iconSize = 32, alt = '' }: Props = $props();

  let failed = $state(false);
  $effect(() => {
    void src;
    failed = false;
  });
</script>

<span class="thumb">
  {#if src && !failed}
    <img {src} {alt} loading="lazy" draggable="false" onerror={() => (failed = true)} />
  {:else}
    <Icon size={iconSize} strokeWidth={1.5} aria-hidden="true" />
  {/if}
</span>

<style>
  .thumb {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    border-radius: inherit;
    background: var(--surface-3);
    color: var(--text-faint);
    overflow: hidden;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }
</style>
