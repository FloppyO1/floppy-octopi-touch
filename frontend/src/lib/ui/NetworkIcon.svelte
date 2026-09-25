<script lang="ts">
  // Network link icon for the status bar (see networkIcon.ts).
  import type { LinkKind } from '../core/system';
  import { networkIcon, networkTone } from './networkIcon';

  interface Props {
    kind: LinkKind;
    signal?: number | null;
    size?: number;
  }

  let { kind, signal = null, size = 20 }: Props = $props();

  const Icon = $derived(networkIcon(kind, signal));
</script>

<span class="net tone-{networkTone(kind, signal)}">
  <Icon {size} strokeWidth={2.2} aria-hidden="true" />
</span>

<style>
  .net {
    display: grid;
    color: var(--accent);
  }
  .tone-paused {
    color: var(--paused);
  }
  .tone-error {
    color: var(--error);
  }
</style>
