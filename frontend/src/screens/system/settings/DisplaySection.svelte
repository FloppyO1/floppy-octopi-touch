<script lang="ts">
  // Screensaver (big view) and screen off when idle.
  import MonitorOff from '@lucide/svelte/icons/monitor-off';
  import MonitorPlay from '@lucide/svelte/icons/monitor-play';
  import { t } from '../../../lib/i18n/index.svelte';
  import { settings } from '../../../lib/stores';
  import Card from '../../../lib/ui/Card.svelte';
  import InputField from '../../../lib/ui/InputField.svelte';
  import Toggle from '../../../lib/ui/Toggle.svelte';

  const s = $derived(settings.value);
  const MINUTES = [5, 10, 15, 30, 60].map((m) => ({ value: m, label: `${m} min` }));
</script>

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
