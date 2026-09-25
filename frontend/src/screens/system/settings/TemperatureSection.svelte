<script lang="ts">
  // Temperature safety: confirmation thresholds and the highest target the NumPad accepts.
  import Flame from '@lucide/svelte/icons/flame';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import { t } from '../../../lib/i18n/index.svelte';
  import { settings } from '../../../lib/stores';
  import Card from '../../../lib/ui/Card.svelte';
  import InputField from '../../../lib/ui/InputField.svelte';

  const temp = $derived(settings.value.temperature);
  // Absolute ceilings: above these a typo is more likely than a real need (PTFE hotends, glass beds).
  const LIMITS = { hotend: 350, bed: 150 } as const;
  type Heater = keyof typeof LIMITS;
  const HEATERS: Heater[] = ['hotend', 'bed'];
  const label = (heater: Heater) => t(heater === 'hotend' ? 'heater.tool0' : 'heater.bed');

  function setMax(heater: Heater, value: number) {
    settings.update((s) => {
      s.temperature.max[heater] = value;
      // The confirmation threshold makes no sense above the maximum.
      s.temperature.confirmAbove[heater] = Math.min(s.temperature.confirmAbove[heater], value);
    });
  }
</script>

<Card title={t('settings.confirmAbove')} icon={ShieldAlert}>
  <p class="hint">{t('settings.confirmAboveHint')}</p>
  <div class="grid">
    {#each HEATERS as heater (heater)}
      <InputField
        type="number"
        label={label(heater)}
        value={temp.confirmAbove[heater]}
        unit="°C"
        min={0}
        max={temp.max[heater]}
        onchange={(value) => settings.update((s) => (s.temperature.confirmAbove[heater] = value))}
        testid="confirm-{heater}"
      />
    {/each}
  </div>
</Card>

<Card title={t('settings.maxTemp')} icon={Flame}>
  <p class="hint">{t('settings.maxTempHint')}</p>
  <div class="grid">
    {#each HEATERS as heater (heater)}
      <InputField
        type="number"
        label={label(heater)}
        value={temp.max[heater]}
        unit="°C"
        min={50}
        max={LIMITS[heater]}
        onchange={(value) => setMax(heater, value)}
        testid="max-{heater}"
      />
    {/each}
  </div>
</Card>

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-3);
  }
  .hint {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--fs-md);
  }
</style>
