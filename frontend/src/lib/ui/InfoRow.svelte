<script lang="ts">
  import type { IconComponent, Tone } from './types';

  interface Props {
    icon: IconComponent;
    label: string;
    value: string;
    /** Colours the icon (and a dot before the value). */
    tone?: Tone;
    testid?: string;
  }

  let { icon: Icon, label, value, tone = 'neutral', testid }: Props = $props();
</script>

<div class="row tone-{tone}">
  <span class="icon"><Icon size={22} strokeWidth={2.2} aria-hidden="true" /></span>
  <span class="text">
    <span class="label">{label}</span>
    <span class="value" data-testid={testid}>{value}</span>
  </span>
</div>

<style>
  .row {
    --tone: var(--idle);
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: 48px;
    min-width: 0;
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
  .icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--tone) 16%, transparent);
    color: var(--tone);
  }
  .text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .label {
    font-size: var(--fs-xs);
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  .value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--fs-md);
    font-weight: var(--fw-medium);
  }
</style>
