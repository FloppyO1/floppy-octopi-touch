<script lang="ts">
  import { arcGeometry, gaugeFraction, GAUGE_SWEEP } from '../core/gauge';
  import { pressable } from './press';
  import type { IconComponent, Tone } from './types';

  interface Props {
    value: number | null | undefined;
    min?: number;
    max?: number;
    /** Optional tick on the ring (heater target). */
    target?: number | null;
    /** Name shown in the gap at the bottom of the ring. */
    label: string;
    /** Small text under the value (e.g. "Target 200°C"). */
    sublabel?: string;
    unit?: string;
    decimals?: number;
    size?: 'S' | 'M' | 'L';
    tone?: Tone;
    icon?: IconComponent;
    /** No reading (sensor missing, plugin not installed…): grey ring and a dash. */
    unavailable?: boolean;
    /** Makes the whole gauge a touch target (opens NumPad / slider). */
    onclick?: () => void;
    testid?: string;
  }

  let {
    value,
    min = 0,
    max = 100,
    target = null,
    label,
    sublabel,
    unit = '',
    decimals = 0,
    size = 'M',
    tone = 'accent',
    icon,
    unavailable = false,
    onclick,
    testid,
  }: Props = $props();

  const DIMENSIONS = {
    S: { px: 112, stroke: 9 },
    M: { px: 148, stroke: 12 },
    L: { px: 184, stroke: 14 },
  } as const;

  const dim = $derived(DIMENSIONS[size]);
  const geo = $derived(arcGeometry(dim.px, dim.stroke));
  const missing = $derived(unavailable || value == null || !Number.isFinite(value));
  const fraction = $derived(missing ? 0 : gaugeFraction(value, min, max));
  const targetFraction = $derived(target ? gaugeFraction(target, min, max) : null);
  const center = $derived(dim.px / 2);
  const text = $derived(missing ? '—' : (value as number).toFixed(decimals));
</script>

<svelte:element
  this={onclick ? 'button' : 'div'}
  type={onclick ? 'button' : undefined}
  role={onclick ? 'button' : 'img'}
  class="gauge size-{size} tone-{missing ? 'neutral' : tone}"
  class:interactive={!!onclick}
  class:missing
  style:width="{dim.px}px"
  style:height="{dim.px}px"
  aria-label={`${label}: ${text}${missing ? '' : unit}${sublabel ? `, ${sublabel}` : ''}`}
  data-testid={testid}
  {onclick}
  {@attach pressable}
>
  <svg viewBox="0 0 {dim.px} {dim.px}" aria-hidden="true">
    <g transform="rotate({geo.rotation} {center} {center})">
      <circle
        class="track"
        cx={center}
        cy={center}
        r={geo.radius}
        stroke-width={dim.stroke}
        stroke-dasharray="{geo.track} {geo.circumference}"
      />
      {#if fraction > 0.002}
        <circle
          class="arc"
          cx={center}
          cy={center}
          r={geo.radius}
          stroke-width={dim.stroke}
          stroke-dasharray="{geo.track * fraction} {geo.circumference}"
        />
      {/if}
    </g>
    {#if targetFraction !== null}
      <g
        class="tick"
        style:transform="rotate({geo.rotation + GAUGE_SWEEP * targetFraction}deg)"
        style:transform-origin="{center}px {center}px"
      >
        <line
          x1={center + geo.radius - dim.stroke / 2 - 3}
          y1={center}
          x2={center + geo.radius + dim.stroke / 2 + 3}
          y2={center}
        />
      </g>
    {/if}
  </svg>
  <span class="center">
    <span class="value tabular">{text}{#if unit && !missing}<span class="unit">{unit}</span>{/if}</span>
    {#if sublabel}<span class="sublabel">{sublabel}</span>{/if}
  </span>
  <span class="label">
    {#if icon && size !== 'S'}
      {@const Icon = icon}
      <Icon size={size === 'L' ? 16 : 14} strokeWidth={2.4} aria-hidden="true" />
    {/if}
    {label}
  </span>
</svelte:element>

<style>
  .gauge {
    --tone: var(--accent);
    position: relative;
    flex: none;
    display: block;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--text);
    text-align: center;
    transition: transform var(--dur-fast) var(--ease);
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
  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  circle {
    fill: none;
    stroke-linecap: round;
  }
  .track {
    stroke: var(--surface-3);
  }
  .arc {
    stroke: var(--tone);
    transition:
      stroke-dasharray 600ms var(--ease),
      stroke var(--dur) var(--ease);
  }
  .tick {
    transition: transform 600ms var(--ease);
  }
  .tick line {
    stroke: var(--text);
    stroke-width: 3;
    stroke-linecap: round;
  }
  .center {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding-bottom: 6%;
  }
  .value {
    font-weight: var(--fw-bold);
    line-height: 1;
    letter-spacing: -0.02em;
  }
  .unit {
    margin-left: 1px;
    font-size: 0.45em;
    font-weight: var(--fw-medium);
    color: var(--text-dim);
    vertical-align: 0.9em;
  }
  .sublabel {
    color: var(--text-dim);
    font-weight: var(--fw-medium);
    white-space: nowrap;
  }
  .label {
    position: absolute;
    left: 50%;
    bottom: 2%;
    display: flex;
    align-items: center;
    gap: 4px;
    transform: translateX(-50%);
    color: var(--tone);
    font-weight: var(--fw-bold);
    letter-spacing: 0.02em;
    white-space: nowrap;
  }
  .missing .value {
    color: var(--text-faint);
  }
  .missing .label {
    color: var(--text-faint);
  }
  .size-S .value {
    font-size: 28px;
  }
  .size-S .sublabel {
    font-size: 12px;
  }
  .size-S .label {
    font-size: 13px;
  }
  .size-M .value {
    font-size: 38px;
  }
  .size-M .sublabel {
    font-size: 14px;
  }
  .size-M .label {
    font-size: 15px;
  }
  .size-L .value {
    font-size: 48px;
  }
  .size-L .sublabel {
    font-size: 15px;
  }
  .size-L .label {
    font-size: 16px;
  }
  .interactive:global([data-pressed]) {
    transform: scale(0.96);
  }
  .interactive:global([data-pressed]) .track {
    stroke: var(--border);
  }
  .interactive:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 4px;
  }
</style>
