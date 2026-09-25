<script lang="ts">
  interface Props {
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    /** Formats the value shown next to the label (default: the number). */
    format?: (value: number) => string;
    disabled?: boolean;
    /** Every change while dragging. */
    oninput?: (value: number) => void;
    /** Once, when the finger is lifted (send commands here). */
    onchange?: (value: number) => void;
  }

  let {
    value = $bindable(0),
    min = 0,
    max = 100,
    step = 1,
    label,
    format = (v: number) => String(v),
    disabled = false,
    oninput,
    onchange,
  }: Props = $props();

  let track: HTMLDivElement;
  let dragging = $state(false);
  const fraction = $derived(max > min ? (Math.min(max, Math.max(min, value)) - min) / (max - min) : 0);

  function valueAt(clientX: number): number {
    const rect = track.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const raw = min + f * (max - min);
    const snapped = Math.round((raw - min) / step) * step + min;
    // Avoid 0.30000000000000004.
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(6));
  }

  function set(next: number) {
    if (next === value) return;
    value = next;
    oninput?.(next);
  }

  function down(event: PointerEvent) {
    if (disabled) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragging = true;
    set(valueAt(event.clientX));
  }
  function move(event: PointerEvent) {
    if (dragging) set(valueAt(event.clientX));
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    onchange?.(value);
  }

  function key(event: KeyboardEvent) {
    const delta = { ArrowLeft: -step, ArrowDown: -step, ArrowRight: step, ArrowUp: step }[event.key];
    if (delta === undefined || disabled) return;
    event.preventDefault();
    set(Number(Math.min(max, Math.max(min, value + delta)).toFixed(6)));
    onchange?.(value);
  }
</script>

<div class="slider" class:disabled class:dragging>
  {#if label}
    <div class="head">
      <span class="label">{label}</span>
      <span class="value tabular">{format(value)}</span>
    </div>
  {/if}
  <div
    class="hit"
    role="slider"
    tabindex={disabled ? -1 : 0}
    aria-label={label}
    aria-valuemin={min}
    aria-valuemax={max}
    aria-valuenow={value}
    aria-valuetext={format(value)}
    aria-disabled={disabled}
    onpointerdown={down}
    onpointermove={move}
    onpointerup={up}
    onpointercancel={up}
    onkeydown={key}
  >
    <div class="track" bind:this={track}>
      <div class="fill" style:width="{fraction * 100}%"></div>
      <div class="thumb" style:left="{fraction * 100}%"></div>
    </div>
  </div>
</div>

<style>
  .slider {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    width: 100%;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: var(--sp-3);
  }
  .label {
    font-weight: var(--fw-medium);
  }
  .value {
    font-size: var(--fs-lg);
    font-weight: var(--fw-bold);
    color: var(--accent-strong);
  }
  .hit {
    display: flex;
    align-items: center;
    height: var(--touch);
    /* The thumb overhangs the track: keep it inside the touch area. */
    padding: 0 18px;
    touch-action: none;
    outline: none;
  }
  .track {
    position: relative;
    flex: 1;
    height: 10px;
    border-radius: var(--r-pill);
    background: var(--surface-3);
  }
  .fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: inherit;
    background: var(--accent);
  }
  .thumb {
    position: absolute;
    top: 50%;
    width: 36px;
    height: 36px;
    margin: -18px 0 0 -18px;
    border: 4px solid var(--accent);
    border-radius: 50%;
    background: var(--text);
    box-shadow: var(--shadow-1);
    transition: transform var(--dur-fast) var(--ease);
  }
  .dragging .thumb {
    transform: scale(1.15);
  }
  .hit:focus-visible .thumb {
    outline: 2px solid var(--accent-strong);
    outline-offset: 3px;
  }
  .disabled {
    opacity: 0.38;
  }
</style>
