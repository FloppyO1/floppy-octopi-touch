<script lang="ts">
  import Flame from '@lucide/svelte/icons/flame';
  import Heater from '@lucide/svelte/icons/heater';
  import Link2 from '@lucide/svelte/icons/link-2';
  import Power from '@lucide/svelte/icons/power';
  import Unlink2 from '@lucide/svelte/icons/unlink-2';
  import { onDestroy } from 'svelte';
  import { formatClock } from '../lib/core/format';
  import { heaterTone } from '../lib/core/gauge';
  import { STATUS_BAR_MAX_ACTIONS } from '../lib/core/power';
  import { phaseTone } from '../lib/core/printerState';
  import { t } from '../lib/i18n/index.svelte';
  import { clock, connection, job, power, printer, settings, system, temperatures } from '../lib/stores';
  import NetworkIcon from '../lib/ui/NetworkIcon.svelte';
  import { pressable } from '../lib/ui/press';
  import { macroColor, macroIcon } from '../screens/terminal/macroLook';
  import { runCustomAction, setPsu } from '../screens/system/actions';

  // Network changes are rare: a slow poll of the agent is enough (the System screen polls faster).
  const NETWORK_POLL_MS = 30_000;
  onDestroy(system.watch(NETWORK_POLL_MS));

  const tone = $derived(connection.live ? phaseTone(printer.phase) : 'neutral');
  const net = $derived(system.network);
  const quick = $derived(settings.value.customActions.filter((a) => a.statusBar).slice(0, STATUS_BAR_MAX_ACTIONS));
  const showPsu = $derived(power.available && settings.value.psu.statusBar);
  const heaters = $derived(temperatures.heaters.filter((h) => h === 'bed' || h.startsWith('tool')));
  const round = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toString());
</script>

<header class="statusbar">
  <div class="phase tone-{tone}" data-testid="status-phase">
    <span class="dot" class:pulse={printer.busy}></span>
    <span>{connection.live ? t(`phase.${printer.phase}`) : t('status.offline')}</span>
    {#if printer.busy && job.completion !== null}
      <span class="progress tabular" data-testid="status-progress">{job.completion.toFixed(0)}%</span>
    {/if}
  </div>

  <div class="temps" data-testid="status-temps">
    {#each heaters as heater (heater)}
      {@const reading = temperatures.latest[heater]}
      {@const Icon = heater === 'bed' ? Heater : Flame}
      <span class="temp tone-{heaterTone(reading?.actual, reading?.target)}" title={t(`heater.${heater}`)}>
        <Icon size={18} strokeWidth={2.2} aria-hidden="true" />
        <span class="tabular">
          {round(reading?.actual)}°{#if reading?.target}<span class="target">/{round(reading.target)}°</span>{/if}
        </span>
      </span>
    {/each}
  </div>

  <div class="right">
    {#if showPsu || quick.length}
      <div class="quick">
        {#if showPsu}
          <button
            type="button"
            class="quick-btn"
            class:on={power.psuOn === true}
            aria-label={t(power.psuOn ? 'power.turnOff' : 'power.turnOn')}
            disabled={power.busy}
            onclick={() => setPsu(power.psuOn !== true)}
            data-testid="status-psu"
            {@attach pressable}
          >
            <Power size={22} strokeWidth={2.4} aria-hidden="true" />
          </button>
        {/if}
        {#each quick as action (action.id)}
          {@const Icon = macroIcon(action.icon)}
          <button
            type="button"
            class="quick-btn"
            style:color={macroColor(action.color)}
            aria-label={action.name}
            onclick={() => runCustomAction(action)}
            data-testid="status-action-{action.id}"
            {@attach pressable}
          >
            <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
          </button>
        {/each}
      </div>
    {/if}
    <span class="net" title={net.interface ?? t('system.noNetwork')} data-testid="status-network">
      <NetworkIcon kind={net.kind} signal={net.signal} />
      {#if net.ip}<span class="ip tabular">{net.ip}</span>{/if}
    </span>
    <span class="link" class:live={connection.live} title={t(connection.live ? 'status.live' : 'status.offline')}>
      {#if connection.live}
        <Link2 size={20} aria-hidden="true" />
      {:else}
        <Unlink2 size={20} aria-hidden="true" />
      {/if}
    </span>
    <time class="clock tabular" data-testid="clock">{formatClock(clock.now, !settings.value.clock24h)}</time>
  </div>
</header>

<style>
  .statusbar {
    display: flex;
    align-items: center;
    gap: var(--sp-5);
    height: var(--statusbar-h);
    padding: 0 var(--sp-4);
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }
  .phase {
    --tone: var(--idle);
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    height: 32px;
    padding: 0 var(--sp-3);
    border-radius: var(--r-pill);
    background: color-mix(in srgb, var(--tone) 14%, transparent);
    color: var(--tone);
    font-weight: var(--fw-bold);
    white-space: nowrap;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--tone);
  }
  .pulse {
    animation: pulse 1.6s ease-in-out infinite;
  }
  .progress {
    color: var(--text);
  }
  .temps {
    display: flex;
    gap: var(--sp-4);
    flex: 1;
    min-width: 0;
  }
  .temp {
    --tone: var(--text-dim);
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--fs-md);
    font-weight: var(--fw-bold);
  }
  .temp :global(svg) {
    color: var(--tone);
  }
  .target {
    color: var(--text-dim);
    font-weight: var(--fw-medium);
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
  .right {
    display: flex;
    align-self: stretch;
    align-items: center;
    gap: var(--sp-4);
    margin-left: auto;
  }
  .quick {
    display: flex;
    align-self: stretch;
  }
  /* Full bar height and 56 px wide: the status bar is 48 px tall. */
  .quick-btn {
    display: grid;
    place-items: center;
    width: 56px;
    height: 100%;
    padding: 0;
    border: 0;
    border-left: 1px solid var(--border);
    background: transparent;
    color: var(--text-dim);
  }
  .quick-btn:last-child {
    border-right: 1px solid var(--border);
  }
  .quick-btn.on {
    color: var(--ok);
  }
  .quick-btn:global([data-pressed]) {
    background: var(--surface-2);
  }
  .net {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .ip {
    color: var(--text-dim);
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
  }
  .link {
    display: grid;
    color: var(--error);
  }
  .link.live {
    color: var(--ok);
  }
  .clock {
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
  }
  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }
</style>
