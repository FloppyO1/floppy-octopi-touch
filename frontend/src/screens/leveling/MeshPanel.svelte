<script lang="ts">
  // Bed mesh: heatmap of the last report (M420 V), automatic probing (G29) with a probe, guided manual
  // mesh (G29 S1/S2) with mesh bed leveling, save to EEPROM.
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Grid3x3 from '@lucide/svelte/icons/grid-3x3';
  import Info from '@lucide/svelte/icons/info';
  import Radar from '@lucide/svelte/icons/radar';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Ruler from '@lucide/svelte/icons/ruler';
  import Save from '@lucide/svelte/icons/save';
  import SkipForward from '@lucide/svelte/icons/skip-forward';
  import X from '@lucide/svelte/icons/x';
  import { formatAxis } from '../../lib/core/move';
  import { MESH_Z_STEPS } from '../../lib/core/settings';
  import { formatClock } from '../../lib/core/format';
  import { t } from '../../lib/i18n/index.svelte';
  import { capabilities, leveling, printer, settings } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import Card from '../../lib/ui/Card.svelte';
  import Segmented from '../../lib/ui/Segmented.svelte';
  import { autoLevel, mblAdjust, mblCancel, mblNext, mblStart, readMesh, saveEeprom } from './actions';
  import MeshMap from './MeshMap.svelte';

  interface Props {
    locked: boolean;
  }

  let { locked }: Props = $props();

  const auto = $derived(capabilities.has('autolevel'));
  const manual = $derived(capabilities.has('manualMesh'));
  const canRead = $derived(auto || manual || capabilities.has('levelingData'));
  const mbl = $derived(leveling.mbl);
  /** Grid size from a previous MBL report, to show "point 3 of 9". */
  const total = $derived(
    leveling.mesh?.kind === 'mbl' ? leveling.mesh.rows.length * (leveling.mesh.rows[0]?.length ?? 0) : null,
  );
  const steps = MESH_Z_STEPS.map((s) => ({ value: s, label: String(s) }));
</script>

<div class="mesh-panel">
  <Card title={t('leveling.mesh')} icon={Grid3x3} class="map-card">
    {#snippet actions()}
      <Button variant="ghost" icon={RefreshCw} disabled={locked || mbl !== null || !canRead} onclick={readMesh} data-testid="mesh-read">
        {t('leveling.read')}
      </Button>
    {/snippet}
    {#if leveling.mesh}
      <p class="meta" data-testid="mesh-meta">
        {t(`leveling.kind.${leveling.mesh.kind}`)} · {formatClock(new Date(leveling.meshAt))}{leveling.active === null
          ? ''
          : ` · ${t(leveling.active ? 'leveling.activeOn' : 'leveling.activeOff')}`}
      </p>
      <MeshMap mesh={leveling.mesh} />
    {:else}
      <p class="empty" data-testid="mesh-empty">
        {leveling.noMesh ? t('leveling.noMesh') : canRead ? t('leveling.notRead') : t('leveling.noLevelingHint')}
      </p>
    {/if}
  </Card>

  <div class="side">
    {#if manual}
      <Card title={t('leveling.manualMesh')} icon={Ruler} compact>
        {#if mbl}
          <p class="big" data-testid="mbl-point">
            {total
              ? t('leveling.mblPointOf', { point: Math.min(mbl.point, total), total })
              : t('leveling.mblPoint', { point: mbl.point })}
          </p>
          <p class="text">{t(mbl.point === 1 ? 'leveling.mblFirst' : 'leveling.mblAdjust')}</p>
          <div class="z-row">
            <Button icon={ArrowDown} onclick={() => mblAdjust(-1)} data-testid="mbl-down">{t('leveling.closer')}</Button>
            <span class="z tabular" data-testid="mbl-z">Z {formatAxis(printer.position?.z)}</span>
            <Button icon={ArrowUp} onclick={() => mblAdjust(1)} data-testid="mbl-up">{t('leveling.farther')}</Button>
          </div>
          <Segmented
            label={t('move.step')}
            value={settings.value.leveling.meshStep}
            options={steps}
            onchange={(step) => settings.update((s) => (s.leveling.meshStep = step))}
            testid="mbl-step"
          />
          <div class="pair">
            <Button icon={X} onclick={mblCancel} data-testid="mbl-cancel">{t('leveling.mblCancel')}</Button>
            <Button variant="primary" icon={SkipForward} onclick={mblNext} data-testid="mbl-next">{t('leveling.mblNext')}</Button>
          </div>
        {:else}
          <p class="text">{t('leveling.mblIntro')}</p>
          <Button variant="primary" icon={Ruler} disabled={locked} onclick={mblStart} data-testid="mbl-start">{t('leveling.mblStart')}</Button>
        {/if}
      </Card>
    {/if}

    {#if auto && !mbl}
      <Card title={t('leveling.autoLevel')} icon={Radar} compact>
        <p class="text">{t('leveling.autoIntro')}</p>
        <Button variant={manual ? 'secondary' : 'primary'} icon={Radar} disabled={locked || mbl !== null} onclick={autoLevel} data-testid="auto-level">
          {t('leveling.autoStart')}
        </Button>
      </Card>
    {/if}

    {#if !auto && !manual}
      <Card title={t('leveling.noProbe')} icon={Info} compact>
        <p class="text" data-testid="mesh-no-tools">{t('leveling.noProbeHint')}</p>
      </Card>
    {/if}

    {#if capabilities.has('eeprom') && (auto || manual) && !mbl}
      <Button icon={Save} size="lg" disabled={locked || !leveling.mesh} onclick={saveEeprom} data-testid="mesh-save">
        {t('leveling.save')}
      </Button>
    {/if}
  </div>
</div>

<style>
  .mesh-panel {
    display: grid;
    flex: 1;
    grid-template-columns: 1fr 340px;
    gap: var(--sp-3);
    min-height: 0;
  }
  .mesh-panel :global(.map-card) {
    min-height: 0;
  }
  .mesh-panel :global(.map-card .actions) {
    align-items: center;
  }
  .meta {
    margin: calc(-1 * var(--sp-2)) 0 0;
    color: var(--text-faint);
    font-size: var(--fs-xs);
  }
  .empty {
    margin: auto;
    max-width: 420px;
    color: var(--text-faint);
    font-size: var(--fs-md);
    text-align: center;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-height: 0;
  }
  .text {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--fs-sm);
    line-height: 1.35;
  }
  .big {
    margin: 0;
    font-size: var(--fs-lg);
    font-weight: var(--fw-bold);
  }
  .z-row {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: var(--sp-2);
  }
  .z {
    font-size: var(--fs-md);
    font-weight: var(--fw-bold);
  }
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-2);
  }
  .side :global(.segmented .btn) {
    padding: 0 var(--sp-1);
  }
</style>
