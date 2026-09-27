<script lang="ts">
  // Cancel single objects: bed map with the objects' footprints (from the agent) and the list; a tap
  // asks for confirmation. The last object left cannot be removed (Stop ends the print).
  import Boxes from '@lucide/svelte/icons/boxes';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { bedFromProfile, remaining, svgPoints, toSvg, type PrintObject } from '../../lib/core/objects';
  import { t } from '../../lib/i18n/index.svelte';
  import { objects, server } from '../../lib/stores';
  import { dialogs } from '../../lib/ui/dialogs.svelte';
  import Modal from '../../lib/ui/Modal.svelte';
  import { pressable } from '../../lib/ui/press';
  import { toast } from '../../lib/ui/toast.svelte';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  const MAP_PX = 380;
  const bed = $derived(bedFromProfile(server.profile));
  const scale = $derived(Math.min(MAP_PX / bed.width, MAP_PX / bed.depth));
  // Touch targets: at least 56 px across on screen, whatever the object's size.
  const hitRadius = $derived(28 / scale);
  const labelSize = $derived(17 / scale);
  const onMap = $derived(objects.list.filter((o) => o.center !== null));
  const method = $derived(t(objects.method === 'm486' ? 'objects.viaFirmware' : 'objects.viaPlugin'));

  async function remove(object: PrintObject) {
    if (object.cancelled || object.target === null) return;
    if (remaining(objects.list) <= 1) {
      toast.show(t('objects.last'), { tone: 'warning' });
      return;
    }
    const ok = await dialogs.confirm({
      title: t('objects.confirmTitle', { name: object.name, number: object.number }),
      message: t('objects.confirmMessage'),
      confirmLabel: t('objects.remove'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await objects.cancel(object);
      toast.show(t('objects.done', { name: object.name }), { tone: 'ok' });
    } catch {
      toast.show(t('objects.failed'), { tone: 'error' });
    }
  }
</script>

<Modal title={t('objects.title')} icon={Boxes} width={900} {onclose} testid="objects-dialog">
  <div class="layout">
    <svg
      class="map"
      viewBox="0 0 {bed.width} {bed.depth}"
      width={bed.width * scale}
      height={bed.depth * scale}
      role="group"
      aria-label={t('objects.title')}
    >
      {#if bed.circular}
        <ellipse class="bed" cx={bed.width / 2} cy={bed.depth / 2} rx={bed.width / 2} ry={bed.depth / 2} />
      {:else}
        <rect class="bed" x="0" y="0" width={bed.width} height={bed.depth} rx={6 / scale} />
      {/if}
      {#each onMap as object (object.key)}
        {@const [cx, cy] = toSvg(object.center!, bed)}
        <g
          class="object"
          class:active={object.active}
          class:cancelled={object.cancelled}
          class:locked={object.target === null}
          role="button"
          tabindex="-1"
          aria-label="{object.number} {object.name}"
          data-testid="object-shape-{object.number}"
          onclick={() => remove(object)}
          onkeydown={(e) => e.key === 'Enter' && remove(object)}
          {@attach pressable}
        >
          {#if object.polygon.length >= 3}
            <polygon points={svgPoints(object.polygon, bed)} stroke-width={2 / scale} />
          {/if}
          <circle class="hit" {cx} {cy} r={hitRadius} />
          <circle class="badge" {cx} {cy} r={labelSize * 0.85} stroke-width={1.5 / scale} />
          <text x={cx} y={cy} font-size={labelSize} dy="0.35em">{object.number}</text>
        </g>
      {/each}
    </svg>

    <div class="side">
      <ul class="list">
        {#each objects.list as object (object.key)}
          <li>
            <button
              type="button"
              class="row"
              class:active={object.active}
              class:cancelled={object.cancelled}
              disabled={object.cancelled || object.target === null}
              onclick={() => remove(object)}
              data-testid="object-row-{object.number}"
              {@attach pressable}
            >
              <span class="number tabular">{object.number}</span>
              <span class="name">{object.name}</span>
              {#if object.cancelled}
                <span class="chip cancelled">{t('objects.cancelled')}</span>
              {:else if object.active}
                <span class="chip active">{t('objects.printing')}</span>
              {/if}
            </button>
          </li>
        {/each}
      </ul>
      {#if objects.needsUpload}
        <p class="warn" data-testid="objects-needs-upload"><TriangleAlert size={20} aria-hidden="true" />{t('objects.needsUpload')}</p>
      {:else}
        <p class="hint">{t('objects.hint')}<br />{t('objects.method', { method })}</p>
      {/if}
    </div>
  </div>
</Modal>

<style>
  .layout {
    display: grid;
    grid-template-columns: 380px 1fr;
    gap: var(--sp-4);
    align-items: start;
  }
  .map {
    justify-self: center;
    overflow: visible;
  }
  .bed {
    fill: var(--surface-2);
    stroke: var(--border);
  }
  .object polygon {
    fill: var(--accent-soft);
    stroke: var(--accent);
    stroke-linejoin: round;
  }
  .object .hit {
    fill: transparent;
  }
  .object .badge {
    fill: var(--surface);
    stroke: var(--accent);
  }
  .object text {
    fill: var(--text);
    font-weight: var(--fw-bold);
    text-anchor: middle;
    pointer-events: none;
  }
  .object.active polygon,
  .object.active .badge {
    stroke: var(--paused);
  }
  .object.active polygon {
    fill: var(--paused-soft);
  }
  .object.cancelled polygon {
    fill: none;
    stroke: var(--text-faint);
    stroke-dasharray: 2 2;
  }
  .object.cancelled .badge {
    stroke: var(--text-faint);
  }
  .object.cancelled text {
    fill: var(--text-faint);
    text-decoration: line-through;
  }
  .object:global([data-pressed]):not(.cancelled):not(.locked) polygon {
    fill: var(--error-soft);
    stroke: var(--error);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-width: 0;
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 300px;
    overflow-y: auto;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    width: 100%;
    min-height: var(--touch);
    padding: 0 var(--sp-3);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-2);
    color: var(--text);
    font-size: var(--fs-md);
    text-align: left;
  }
  .row:global([data-pressed]) {
    background: var(--error-soft);
    border-color: var(--error);
  }
  .row.active {
    border-color: var(--paused);
  }
  .row:disabled {
    opacity: 1;
    color: var(--text-faint);
  }
  .row.cancelled .name {
    text-decoration: line-through;
  }
  .number {
    display: grid;
    place-items: center;
    min-width: 32px;
    height: 32px;
    border-radius: var(--r-pill);
    background: var(--surface-3);
    font-weight: var(--fw-bold);
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip {
    padding: 2px var(--sp-2);
    border-radius: var(--r-pill);
    font-size: var(--fs-xs);
    font-weight: var(--fw-medium);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .chip.active {
    background: var(--paused-soft);
    color: var(--paused);
  }
  .chip.cancelled {
    background: var(--surface-3);
    color: var(--text-dim);
  }
  .hint,
  .warn {
    margin: 0;
    font-size: var(--fs-sm);
    color: var(--text-dim);
  }
  .warn {
    display: flex;
    gap: var(--sp-2);
    color: var(--paused);
  }
</style>
