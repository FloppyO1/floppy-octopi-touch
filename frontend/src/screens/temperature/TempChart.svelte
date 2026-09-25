<script lang="ts">
  // Live temperature chart (uPlot, canvas): actual + dashed target per heater over the last N minutes.
  import { untrack } from 'svelte';
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  import { formatClock } from '../../lib/core/format';
  import { heaterColorVar } from '../../lib/core/chart';
  import { t } from '../../lib/i18n/index.svelte';
  import { settings, temperatures } from '../../lib/stores';

  interface Props {
    minutes: number;
  }

  let { minutes }: Props = $props();

  let host: HTMLDivElement;
  let plot: uPlot | null = null;

  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function build(heaters: string[]): uPlot {
    const text = css('--text-dim');
    const grid = css('--border');
    const font = `13px ${css('--font')}`;
    const series: uPlot.Series[] = [{}];
    for (const heater of heaters) {
      const color = css(heaterColorVar(heater));
      series.push({ label: t(`heater.${heater}`), stroke: color, width: 2.5, points: { show: false } });
      series.push({
        label: `${t(`heater.${heater}`)} target`,
        stroke: color,
        width: 1.5,
        dash: [6, 6],
        alpha: 0.7,
        points: { show: false },
      });
    }
    const axis = { stroke: text, font, grid: { stroke: grid, width: 1 }, ticks: { stroke: grid, width: 1 } };
    return new uPlot(
      {
        width: host.clientWidth,
        height: host.clientHeight,
        pxAlign: 0,
        legend: { show: false },
        cursor: { show: false },
        series,
        scales: {
          x: { time: true, range: (_u, _min, max) => [max - minutes * 60, max] },
          // From 0 up to a round value above the highest reading or target.
          y: { range: (_u, _min, max) => [0, Math.max(60, Math.ceil((max + 15) / 25) * 25)] },
        },
        axes: [
          {
            ...axis,
            space: 90,
            values: (_u, splits) => splits.map((s) => formatClock(new Date(s * 1000), !settings.value.clock24h)),
          },
          { ...axis, size: 48, values: (_u, splits) => splits.map((s) => `${s}°`) },
        ],
      },
      data(heaters),
      host,
    );
  }

  function data(heaters: string[]): uPlot.AlignedData {
    const columns = temperatures.history.columns(minutes * 60);
    const out: (number | null)[][] = [columns.time];
    for (const heater of heaters) {
      out.push(columns.series[heater]?.actual ?? [], columns.series[heater]?.target ?? []);
    }
    return out as uPlot.AlignedData;
  }

  // Rebuilt when the heaters change (a new series set); cheap `setData` on every new sample.
  $effect(() => {
    const heaters = temperatures.heaters;
    plot = untrack(() => build(heaters));
    const observer = new ResizeObserver(() => plot?.setSize({ width: host.clientWidth, height: host.clientHeight }));
    observer.observe(host);
    return () => {
      observer.disconnect();
      plot?.destroy();
      plot = null;
    };
  });

  $effect(() => {
    // Both read by the scale ranges: a new sample or window re-fits the axes.
    void temperatures.revision;
    void minutes;
    plot?.setData(data(temperatures.heaters));
  });
</script>

<div class="chart" bind:this={host} data-testid="temp-chart" aria-label={t('temps.chart')} role="img"></div>

<style>
  .chart {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .chart :global(.uplot) {
    position: absolute;
    inset: 0;
    font-family: var(--font);
  }
</style>
