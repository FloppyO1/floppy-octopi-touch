<script lang="ts">
  // Firmware capabilities: what M115 reported and the manual override (auto / on / off) for each,
  // including the features Marlin does not report (M600, M701/M702, manual mesh).
  import Cpu from '@lucide/svelte/icons/cpu';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import { printer as printerApi } from '../../../lib/api/octoprint';
  import { CAPABILITIES, CAPABILITY_KEYS, type CapabilityKey, type CapabilityOverride } from '../../../lib/core/capabilities';
  import { t } from '../../../lib/i18n/index.svelte';
  import { capabilities, printer, settings } from '../../../lib/stores';
  import Button from '../../../lib/ui/Button.svelte';
  import Card from '../../../lib/ui/Card.svelte';
  import Segmented from '../../../lib/ui/Segmented.svelte';
  import { toast } from '../../../lib/ui/toast.svelte';

  const overrides = $derived<{ value: CapabilityOverride; label: string }[]>(
    (['auto', 'on', 'off'] as const).map((value) => ({ value, label: t(`caps.override.${value}`) })),
  );

  function detected(key: CapabilityKey): string {
    const marlin = CAPABILITIES[key];
    if (marlin === null) return t('caps.manualOnly');
    const state = capabilities.resolved[key].detected;
    if (state === null) return capabilities.known ? t('caps.notReported', { name: marlin }) : t('caps.unknown');
    return t(state ? 'caps.detectedYes' : 'caps.detectedNo', { name: marlin });
  }

  async function readAgain() {
    try {
      await printerApi.command('M115');
      toast.show(t('caps.requested'), { tone: 'ok' });
    } catch {
      toast.show(t('terminal.failed'), { tone: 'error' });
    }
  }
</script>

<Card title={t('caps.title')} icon={Cpu}>
  {#snippet actions()}
    <Button icon={RefreshCw} disabled={!printer.operational} onclick={readAgain} data-testid="caps-read">{t('caps.read')}</Button>
  {/snippet}
  <p class="firmware" data-testid="firmware-name">
    {capabilities.report.firmwareName ?? t('caps.noFirmware')}
  </p>
  <p class="hint">{t('caps.intro')}</p>
  <ul class="list">
    {#each CAPABILITY_KEYS as key (key)}
      {@const state = capabilities.resolved[key]}
      <li data-testid="cap-{key}">
        <span class="text">
          <span class="name">
            <span class="dot" class:on={state.enabled} aria-hidden="true"></span>
            {t(`caps.${key}`)}
          </span>
          <span class="meta">{detected(key)}</span>
        </span>
        <Segmented
          label={t(`caps.${key}`)}
          value={state.override}
          options={overrides}
          testid="cap-{key}"
          onchange={(value) => settings.update((s) => (s.capabilities.overrides[key] = value))}
        />
      </li>
    {/each}
  </ul>
</Card>

<style>
  .firmware {
    margin: 0;
    color: var(--text);
    font-size: var(--fs-lg);
    font-weight: var(--fw-bold);
  }
  .hint {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    padding: var(--sp-2) 0;
    border-top: 1px solid var(--border);
  }
  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .name {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
    color: var(--text);
    font-size: var(--fs-md);
    font-weight: var(--fw-bold);
  }
  .dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--idle);
  }
  .dot.on {
    background: var(--ok);
  }
  .meta {
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  li :global(.btn) {
    min-width: 80px;
  }
</style>
