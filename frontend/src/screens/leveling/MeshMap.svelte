<script lang="ts">
  // Mesh heatmap as seen from the front of the printer (back row on top). Diverging colours around the
  // mesh average: blue = lower, orange = higher, grey = average; the value is printed in every cell.
  import { formatOffset, meshStats, meshTone, type Mesh } from '../../lib/core/mesh';
  import { t } from '../../lib/i18n/index.svelte';

  interface Props {
    mesh: Mesh;
  }

  let { mesh }: Props = $props();

  const stats = $derived(meshStats(mesh));
  const columns = $derived(Math.max(...mesh.rows.map((r) => r.length)));
  /** Back row first. */
  const rows = $derived(mesh.rows.map((values, y) => ({ y, values })).reverse());
  const dense = $derived(columns > 6 || mesh.rows.length > 6);

  function cellStyle(value: number | null): string {
    if (value === null || !stats) return '';
    const tone = meshTone(value, stats);
    const pole = tone < 0 ? 'var(--mesh-low)' : 'var(--mesh-high)';
    return `background: color-mix(in oklab, ${pole} ${Math.round(Math.abs(tone) * 78)}%, var(--mesh-mid))`;
  }

  const isAt = (at: { x: number; y: number } | undefined, x: number, y: number) => at?.x === x && at?.y === y;
</script>

<div class="mesh" data-testid="mesh-map">
  <span class="edge">{t('leveling.back')}</span>
  <div class="grid" class:dense style:grid-template-columns="repeat({columns}, 1fr)" role="table" aria-label={t('leveling.mesh')}>
    {#each rows as row (row.y)}
      {#each row.values as value, x (x)}
        <div
          class="cell"
          class:empty={value === null}
          class:extreme={isAt(stats?.minAt, x, row.y) || isAt(stats?.maxAt, x, row.y)}
          style={cellStyle(value)}
          role="cell"
          data-testid="mesh-cell-{x}-{row.y}"
        >
          {value === null ? '—' : formatOffset(value, dense ? 2 : 3)}
        </div>
      {/each}
    {/each}
  </div>
  <span class="edge">{t('leveling.front')}</span>

  {#if stats}
    <dl class="legend" data-testid="mesh-stats">
      <div><dt>{t('leveling.min')}</dt><dd class="tabular">{formatOffset(stats.min)}</dd></div>
      <span class="ramp" aria-hidden="true"></span>
      <div class="end"><dt>{t('leveling.max')}</dt><dd class="tabular">{formatOffset(stats.max)}</dd></div>
      <div class="range"><dt>{t('leveling.range')}</dt><dd class="tabular" data-testid="mesh-range">{stats.range.toFixed(3)} mm</dd></div>
    </dl>
  {/if}
</div>

<style>
  .mesh {
    --mesh-low: var(--cooling);
    --mesh-high: var(--heating);
    --mesh-mid: var(--surface-3);
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: stretch;
    gap: var(--sp-1);
    min-height: 0;
  }
  .edge {
    color: var(--text-faint);
    font-size: var(--fs-xs);
    letter-spacing: 0.06em;
    text-align: center;
    text-transform: uppercase;
  }
  .grid {
    display: grid;
    flex: 1;
    grid-auto-rows: 1fr;
    gap: 2px;
    min-height: 0;
    padding: 2px;
    border-radius: var(--r-md);
    background: var(--surface);
  }
  .cell {
    display: grid;
    place-items: center;
    min-width: 0;
    min-height: 0;
    border-radius: 6px;
    background: var(--mesh-mid);
    color: var(--text);
    font-size: var(--fs-md);
    font-weight: var(--fw-medium);
    font-variant-numeric: tabular-nums;
  }
  .dense .cell {
    font-size: var(--fs-xs);
  }
  .cell.empty {
    background: var(--surface-2);
    color: var(--text-faint);
  }
  .cell.extreme {
    outline: 2px solid var(--text);
    outline-offset: -2px;
    font-weight: var(--fw-bold);
  }
  .legend {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    margin: var(--sp-2) 0 0;
  }
  .legend div {
    display: flex;
    flex-direction: column;
  }
  .legend .end {
    align-items: flex-end;
  }
  .ramp {
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: linear-gradient(90deg, var(--mesh-low), var(--mesh-mid), var(--mesh-high));
  }
  .range {
    margin-left: var(--sp-3);
    padding-left: var(--sp-4);
    border-left: 1px solid var(--border);
  }
  dt {
    color: var(--text-faint);
    font-size: var(--fs-xs);
  }
  dd {
    margin: 0;
    color: var(--text);
    font-size: var(--fs-md);
    font-weight: var(--fw-bold);
  }
  .range dd {
    color: var(--accent-strong);
  }
</style>
