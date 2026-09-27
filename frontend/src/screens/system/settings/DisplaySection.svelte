<script lang="ts">
  // Screensaver (big view) and screen off when idle.
  import Monitor from '@lucide/svelte/icons/monitor';
  import MonitorOff from '@lucide/svelte/icons/monitor-off';
  import MonitorPlay from '@lucide/svelte/icons/monitor-play';
  import { onMount } from 'svelte';
  import {
    getDisplayModes,
    keepDisplayMode,
    revertDisplayMode,
    tryDisplayMode,
    type DisplayModes,
  } from '../../../lib/api/agent';
  import { t } from '../../../lib/i18n/index.svelte';
  import { settings } from '../../../lib/stores';
  import Card from '../../../lib/ui/Card.svelte';
  import { dialogs } from '../../../lib/ui/dialogs.svelte';
  import InputField from '../../../lib/ui/InputField.svelte';
  import Select from '../../../lib/ui/Select.svelte';
  import { toast } from '../../../lib/ui/toast.svelte';
  import Toggle from '../../../lib/ui/Toggle.svelte';

  const s = $derived(settings.value);
  const MINUTES = [5, 10, 15, 30, 60].map((m) => ({ value: m, label: `${m} min` }));

  // Screen resolution: the 7" screen does not advertise its own 1024x600, which the agent forces.
  const NATIVE = '1024x600@60Hz';
  const PREFERRED = 'preferred';
  let display = $state<DisplayModes | null>(null);
  let busy = $state(false);

  const modeLabel = (mode: string | null) =>
    !mode ? '—' : mode === PREFERRED ? t('settings.resolutionPreferred') : mode.replace('x', ' × ').replace('@', ' · ').replace('Hz', ' Hz');
  const modeOptions = $derived.by(() => {
    const modes = [NATIVE, ...(display?.modes ?? []).filter((m) => m !== NATIVE), PREFERRED];
    if (display && !modes.includes(display.mode)) modes.splice(1, 0, display.mode);
    return modes.map((mode) => ({
      value: mode,
      label: mode === NATIVE ? t('settings.resolutionRecommended', { mode: modeLabel(mode) }) : modeLabel(mode),
    }));
  });

  async function refreshModes() {
    display = await getDisplayModes().catch(() => null);
  }

  async function chooseMode(mode: string) {
    busy = true;
    try {
      display = await tryDisplayMode(mode);
    } catch {
      toast.show(t('settings.resolutionFailed'), { tone: 'error' });
      await refreshModes();
      busy = false;
      return;
    }
    // The agent goes back by itself after revertSeconds (a mode the screen cannot show must not stick).
    const seconds = display.revertSeconds;
    const timer = setTimeout(() => dialogs.closeAll(), seconds * 1000);
    const keep = await dialogs.confirm({
      title: t('settings.resolutionKeepTitle'),
      message: t('settings.resolutionKeepMessage', { seconds }),
      confirmLabel: t('settings.resolutionKeep'),
      cancelLabel: t('settings.resolutionUndo'),
    });
    clearTimeout(timer);
    const kept = keep && (await keepDisplayMode().then(() => true, () => false));
    if (!kept) await revertDisplayMode().catch(() => undefined);
    toast.show(t(kept ? 'settings.resolutionKept' : 'settings.resolutionReverted'), { tone: kept ? 'ok' : 'warning' });
    await refreshModes();
    busy = false;
  }

  onMount(refreshModes);
</script>

<Card title={t('settings.resolution')} icon={Monitor}>
  <Select
    label={t('settings.resolutionLabel')}
    value={display?.pending ?? display?.mode ?? NATIVE}
    options={modeOptions}
    disabled={!display || display.locked || busy}
    onchange={chooseMode}
    testid="display-mode"
  />
  <p class="hint">
    {#if display?.locked}{t('settings.resolutionLocked')}{:else}{t('settings.resolutionHint', { current: modeLabel(display?.current ?? null) })}{/if}
  </p>
</Card>

<Card title={t('system.screensaver')} icon={MonitorPlay}>
  <div data-testid="saver-toggle">
    <Toggle
      label={t('settings.saverEnabled')}
      hint={t('settings.saverHint')}
      checked={s.screensaver.enabled}
      onchange={(on) => settings.update((v) => (v.screensaver.enabled = on))}
    />
  </div>
  <InputField
    type="number"
    label={t('settings.saverTimeout')}
    value={s.screensaver.timeoutMin}
    unit=" min"
    min={1}
    max={120}
    presets={MINUTES}
    disabled={!s.screensaver.enabled}
    onchange={(value) => settings.update((v) => (v.screensaver.timeoutMin = value))}
    testid="saver-timeout"
  />
  <div data-testid="saver-thumbnail-toggle">
    <Toggle
      label={t('system.saverThumbnail')}
      hint={t('system.saverThumbnailHint')}
      checked={s.screensaver.showThumbnail}
      disabled={!s.screensaver.enabled}
      onchange={(on) => settings.update((v) => (v.screensaver.showThumbnail = on))}
    />
  </div>
</Card>

<Card title={t('settings.screenOff')} icon={MonitorOff}>
  <div data-testid="screenoff-toggle">
    <Toggle
      label={t('settings.screenOffEnabled')}
      hint={t('settings.screenOffHint')}
      checked={s.screenOff.enabled}
      onchange={(on) => settings.update((v) => (v.screenOff.enabled = on))}
    />
  </div>
  <InputField
    type="number"
    label={t('settings.screenOffTimeout')}
    value={s.screenOff.timeoutMin}
    unit=" min"
    min={1}
    max={240}
    presets={MINUTES}
    disabled={!s.screenOff.enabled}
    onchange={(value) => settings.update((v) => (v.screenOff.timeoutMin = value))}
    testid="screenoff-timeout"
  />
</Card>

<style>
  .hint {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
</style>
