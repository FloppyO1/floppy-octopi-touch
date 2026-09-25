<script lang="ts">
  // Assisted leveling without a probe: the nozzle goes to Z0 over each corner and the centre, the user
  // turns the bed knobs until a sheet of paper drags slightly.
  import ArrowUpFromLine from '@lucide/svelte/icons/arrow-up-from-line';
  import CircleCheck from '@lucide/svelte/icons/circle-check';
  import House from '@lucide/svelte/icons/house';
  import ScanLine from '@lucide/svelte/icons/scan-line';
  import SkipForward from '@lucide/svelte/icons/skip-forward';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { levelingPoints, nextPoint } from '../../lib/core/leveling';
  import { formatAxis } from '../../lib/core/move';
  import { t } from '../../lib/i18n/index.svelte';
  import { leveling, printer, server, settings } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import Card from '../../lib/ui/Card.svelte';
  import InputField from '../../lib/ui/InputField.svelte';
  import { pressable } from '../../lib/ui/press';
  import { finishPaperTest, goToPoint, homeAll } from './actions';

  interface Props {
    locked: boolean;
  }

  let { locked }: Props = $props();

  const points = $derived(levelingPoints(server.profile, settings.value.leveling.inset));
  const volume = $derived(server.profile?.volume);
  const canMove = $derived(!locked && printer.homed && points !== null);

  function next() {
    const id = nextPoint(leveling.point);
    const point = points?.find((p) => p.id === id);
    if (point) void goToPoint(point);
  }
</script>

<div class="paper">
  <Card title={t('leveling.bed')} icon={ScanLine} class="bed-card">
    {#if points && volume}
      <div class="bed-wrap">
        <span class="edge">{t('leveling.back')}</span>
        <div class="bed" style:aspect-ratio="{volume.width} / {volume.depth}" data-testid="paper-bed">
          {#each points as point, i (point.id)}
            <button
              type="button"
              class="point"
              class:current={leveling.point === point.id}
              style:left="{point.u * 100}%"
              style:bottom="{point.v * 100}%"
              disabled={!canMove}
              aria-label={t(`leveling.point.${point.id}`)}
              onclick={() => goToPoint(point)}
              data-testid="point-{point.id}"
              {@attach pressable}
            >
              {i + 1}
            </button>
          {/each}
        </div>
        <span class="edge">{t('leveling.front')}</span>
      </div>
    {:else}
      <p class="hint">{t('move.noLimits')}</p>
    {/if}
  </Card>

  <div class="side">
    <Card title={t('leveling.paperTest')} icon={SlidersHorizontal} compact>
      <ol class="steps">
        <li>{t('leveling.paperStep1')}</li>
        <li>{t('leveling.paperStep2')}</li>
        <li>{t('leveling.paperStep3')}</li>
      </ol>
      {#if printer.homed}
        <p class="state ok"><CircleCheck size={18} aria-hidden="true" />{t('leveling.homed')}</p>
      {:else}
        <p class="state warn" data-testid="paper-not-homed"><TriangleAlert size={18} aria-hidden="true" />{t('leveling.notHomed')}</p>
      {/if}
      <div class="pair">
        <Button variant={printer.homed ? 'secondary' : 'primary'} icon={House} disabled={locked} onclick={homeAll} data-testid="paper-home">
          {t('leveling.home')}
        </Button>
        <Button variant={printer.homed ? 'primary' : 'secondary'} icon={SkipForward} disabled={!canMove} onclick={next} data-testid="paper-next">
          {leveling.point === null ? t('leveling.firstPoint') : t('leveling.nextPoint')}
        </Button>
      </div>
      <div class="pair">
        <p class="where tabular" data-testid="paper-position">
          {leveling.point ? `${t(`leveling.point.${leveling.point}`)} · ` : ''}Z {formatAxis(printer.position?.z)}
        </p>
        <Button icon={ArrowUpFromLine} disabled={locked || leveling.point === null} onclick={finishPaperTest} data-testid="paper-finish">
          {t('leveling.finish')}
        </Button>
      </div>
    </Card>

    <Card compact>
      <div class="pair">
        <InputField
          type="number"
          label={t('leveling.inset')}
          value={settings.value.leveling.inset}
          unit=" mm"
          min={0}
          max={80}
          onchange={(v) => settings.update((s) => (s.leveling.inset = v))}
          testid="paper-inset"
        />
        <InputField
          type="number"
          label={t('leveling.zHop')}
          value={settings.value.leveling.zHop}
          unit=" mm"
          min={1}
          max={30}
          onchange={(v) => settings.update((s) => (s.leveling.zHop = v))}
          testid="paper-zhop"
        />
      </div>
    </Card>
  </div>
</div>

<style>
  .paper {
    display: grid;
    flex: 1;
    grid-template-columns: 1fr 420px;
    gap: var(--sp-3);
    min-height: 0;
  }
  .paper :global(.bed-card) {
    min-height: 0;
  }
  .bed-wrap {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--sp-1);
    min-height: 0;
  }
  .edge {
    color: var(--text-faint);
    font-size: var(--fs-xs);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .bed {
    position: relative;
    height: 320px;
    max-width: 100%;
    border: 2px solid var(--border);
    border-radius: var(--r-lg);
    background:
      linear-gradient(var(--surface-2) 1px, transparent 1px) 0 0 / 25% 25%,
      linear-gradient(90deg, var(--surface-2) 1px, transparent 1px) 0 0 / 25% 25%,
      var(--bg);
  }
  .point {
    position: absolute;
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    border: 2px solid var(--accent);
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--accent-strong);
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
    transform: translate(-50%, 50%);
    transition:
      transform var(--dur-fast) var(--ease),
      background-color var(--dur) var(--ease);
  }
  .point.current {
    background: var(--accent);
    color: var(--on-accent);
    box-shadow: 0 0 0 6px var(--accent-soft);
  }
  .point:global([data-pressed]) {
    transform: translate(-50%, 50%) scale(0.92);
  }
  .point:disabled {
    border-color: var(--border);
    color: var(--text-faint);
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-height: 0;
  }
  .steps {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding-left: var(--sp-5);
    color: var(--text-dim);
    font-size: var(--fs-sm);
    line-height: 1.35;
  }
  .state {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    margin: 0;
    font-size: var(--fs-sm);
  }
  .state.ok {
    color: var(--ok);
  }
  .state.warn {
    color: var(--paused);
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-items: center;
    gap: var(--sp-2);
  }
  .where {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .hint {
    margin: auto;
    color: var(--text-faint);
  }
</style>
