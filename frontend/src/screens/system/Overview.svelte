<script lang="ts">
  // System overview: CPU/RAM/disk rings, network, OctoPrint system commands and power/lights buttons.
  import Cpu from '@lucide/svelte/icons/cpu';
  import EthernetPort from '@lucide/svelte/icons/ethernet-port';
  import HardDrive from '@lucide/svelte/icons/hard-drive';
  import MemoryStick from '@lucide/svelte/icons/memory-stick';
  import Monitor from '@lucide/svelte/icons/monitor';
  import Network from '@lucide/svelte/icons/network';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Power from '@lucide/svelte/icons/power';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import Router from '@lucide/svelte/icons/router';
  import Server from '@lucide/svelte/icons/server';
  import Timer from '@lucide/svelte/icons/timer';
  import Zap from '@lucide/svelte/icons/zap';
  import { onDestroy } from 'svelte';
  import { formatBytes } from '../../lib/core/format';
  import { cpuTempTone, uptimeParts, usageTone, type SystemCommandKind } from '../../lib/core/system';
  import { t } from '../../lib/i18n/index.svelte';
  import { power, settings, system } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import Card from '../../lib/ui/Card.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import InfoRow from '../../lib/ui/InfoRow.svelte';
  import { networkIcon, networkTone } from '../../lib/ui/networkIcon';
  import RingGauge from '../../lib/ui/RingGauge.svelte';
  import type { IconComponent } from '../../lib/ui/types';
  import { macroColor, macroIcon } from '../terminal/macroLook';
  import ActionManager from './ActionManager.svelte';
  import { restartInterface, runCustomAction, runSystemCommand, setPsu } from './actions';


  const POLL_MS = 3000;
  const stopWatching = system.watch(POLL_MS);
  void system.loadCommands();
  onDestroy(stopWatching);

  let managing = $state(false);

  const info = $derived(system.info);
  const cpu = $derived(info?.cpu);
  const net = $derived(system.network);

  // The CPU ring warns about heat as well as load: throttling starts at 80 °C on the Pi.
  const cpuTone = $derived.by(() => {
    const heat = cpuTempTone(cpu?.temperature);
    return heat === 'error' || heat === 'paused' ? heat : usageTone(cpu?.percent);
  });
  const cpuSub = $derived(
    [cpu?.temperature != null ? `${cpu.temperature.toFixed(0)}°C` : null, cpu?.frequency ? `${cpu.frequency} MHz` : null]
      .filter(Boolean)
      .join(' · '),
  );
  const uptime = $derived.by(() => {
    const parts = uptimeParts(info?.uptime);
    if (!parts) return '—';
    if (parts.days) return t('system.uptimeDays', { days: parts.days, hours: parts.hours });
    return t('system.uptimeHours', { hours: parts.hours, minutes: String(parts.minutes).padStart(2, '0') });
  });
  const linkText = $derived.by(() => {
    if (net.kind === 'wifi') return net.ssid ?? t('system.wifi');
    if (net.kind === 'ethernet') return t('system.ethernet');
    return t('system.noNetwork');
  });

  const COMMAND_ICONS: Record<SystemCommandKind, IconComponent> = {
    restart: RefreshCw,
    restartSafe: RefreshCw,
    reboot: RotateCcw,
    shutdown: Power,
    other: Zap,
  };
  const core = $derived((system.commands ?? []).filter((c) => ['restart', 'reboot', 'shutdown'].includes(c.kind)));
  const octoprintCustom = $derived((system.commands ?? []).filter((c) => c.kind === 'other'));
  const customActions = $derived(settings.value.customActions);
</script>

<div class="overview">
  <Card title={t('system.host')} icon={Server} class="host">
    <div class="rings">
      <RingGauge
        value={cpu?.percent}
        label={t('system.cpu')}
        sublabel={cpuSub || undefined}
        unit="%"
        tone={cpuTone}
        icon={Cpu}
        unavailable={!info}
        testid="gauge-cpu"
      />
      <RingGauge
        value={info?.memory?.percent}
        label={t('system.ram')}
        sublabel={info?.memory ? `${formatBytes(info.memory.used)} / ${formatBytes(info.memory.total)}` : undefined}
        unit="%"
        tone={usageTone(info?.memory?.percent)}
        icon={MemoryStick}
        unavailable={!info?.memory}
        testid="gauge-ram"
      />
      <RingGauge
        value={info?.disk?.percent}
        label={t('system.disk')}
        sublabel={info?.disk ? t('files.free', { free: formatBytes(info.disk.free) }) : undefined}
        unit="%"
        tone={usageTone(info?.disk?.percent)}
        icon={HardDrive}
        unavailable={info?.disk?.percent == null}
        testid="gauge-disk"
      />
    </div>
    {#if system.error && !info}
      <p class="warn">{t('system.agentError')}</p>
    {/if}
  </Card>

  <Card title={t('system.network')} icon={Network} class="network">
    <div class="rows">
      <InfoRow icon={networkIcon(net.kind, net.signal)} label={t('system.connection')} value={linkText} tone={networkTone(net.kind, net.signal)} testid="net-link" />
      <InfoRow icon={Network} label={t('system.ip')} value={net.ip ?? '—'} tone={net.ip ? 'accent' : 'neutral'} testid="net-ip" />
      <InfoRow icon={Router} label={t('system.gateway')} value={info?.network.gateway ?? '—'} />
      <InfoRow icon={Monitor} label={t('system.hostname')} value={info?.hostname ?? '—'} testid="net-hostname" />
      <InfoRow icon={Timer} label={t('system.uptime')} value={uptime} />
      <InfoRow icon={EthernetPort} label={t('system.interface')} value={net.interface ?? '—'} />
    </div>
  </Card>

  <Card title={t('system.commands')} icon={Power} class="commands">
    <div class="buttons" data-testid="system-commands">
      {#each core as command (command.action)}
        {@const Icon = COMMAND_ICONS[command.kind]}
        <Button
          icon={Icon}
          class={command.kind === 'restart' ? '' : 'hard'}
          onclick={() => runSystemCommand(command)}
          data-testid="syscmd-{command.action}"
        >
          {t(`system.cmd.${command.kind}`)}
        </Button>
      {/each}
      <Button icon={Monitor} onclick={restartInterface} data-testid="kiosk-restart">{t('system.kioskRestart')}</Button>
    </div>
    {#if system.commands && !core.some((c) => c.kind === 'shutdown')}
      <p class="hint">{t('system.noShutdown')}</p>
    {:else if system.commandsError}
      <p class="warn">{t('system.commandsError')}</p>
    {/if}
  </Card>

  <Card title={t('power.title')} icon={Zap} class="power">
    {#snippet actions()}
      <IconButton icon={Pencil} label={t('presets.manage')} onclick={() => (managing = true)} data-testid="actions-manage" />
    {/snippet}
    <div class="power-list">
      {#if power.available}
        <Button
          icon={Power}
          selected={power.psuOn === true}
          disabled={power.busy}
          onclick={() => setPsu(power.psuOn !== true)}
          data-testid="psu-toggle"
        >
          {t('power.psu')} · {power.psuOn == null ? t('power.unknown') : t(power.psuOn ? 'power.isOn' : 'power.isOff')}
        </Button>
      {/if}
      <div class="buttons">
        {#each customActions as action (action.id)}
          <Button
            icon={macroIcon(action.icon)}
            style="--icon-color: {macroColor(action.color)}"
            onclick={() => runCustomAction(action)}
            data-testid="action-{action.id}"
          >
            {action.name}
          </Button>
        {/each}
        {#each octoprintCustom as command (`${command.source}/${command.action}`)}
          <Button icon={Zap} onclick={() => runSystemCommand(command)} data-testid="syscmd-{command.action}">{command.name}</Button>
        {/each}
      </div>
      {#if !power.available && !customActions.length && !octoprintCustom.length}
        <p class="hint">{t('power.empty')}</p>
      {/if}
    </div>
  </Card>
</div>

{#if managing}
  <ActionManager onclose={() => (managing = false)} />
{/if}

<style>
  .overview {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto 1fr;
    gap: var(--sp-3);
    min-height: 0;
    flex: 1;
  }
  .rings {
    display: flex;
    gap: var(--sp-5);
    justify-content: center;
  }
  .rows {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0 var(--sp-3);
  }
  .buttons {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-2);
  }
  .buttons :global(.btn > svg) {
    color: var(--icon-color, currentColor);
  }
  /* Reboot and shutdown: neutral buttons with a red icon, the confirmation carries the warning. */
  .buttons :global(.hard) {
    --icon-color: var(--error);
  }
  /* Names chosen by the user can be long: two lines rather than an ellipsis. */
  .power-list :global(.label) {
    line-height: 1.15;
    white-space: normal;
  }
  .buttons :global(.btn) {
    justify-content: flex-start;
  }
  .power-list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .overview :global(.power),
  .overview :global(.commands) {
    min-height: 0;
  }
  .hint,
  .warn {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--fs-sm);
  }
  .warn {
    color: var(--paused);
  }
</style>
