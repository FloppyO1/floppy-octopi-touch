<script lang="ts">
  // Create or edit one temperature preset: name (on-screen keyboard), hotend, bed, optional fan.
  import Thermometer from '@lucide/svelte/icons/thermometer';
  import { PRESET_NAME_MAX, validatePreset, type PresetError } from '../../lib/core/presets';
  import type { TemperaturePreset } from '../../lib/core/settings';
  import { t } from '../../lib/i18n/index.svelte';
  import { settings } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import InputField from '../../lib/ui/InputField.svelte';
  import Modal from '../../lib/ui/Modal.svelte';
  import Toggle from '../../lib/ui/Toggle.svelte';

  interface Props {
    preset: TemperaturePreset;
    isNew: boolean;
    onsave: (preset: TemperaturePreset) => void;
    oncancel: () => void;
  }

  let { preset, isNew, onsave, oncancel }: Props = $props();

  // svelte-ignore state_referenced_locally
  let draft = $state({ ...preset });
  // svelte-ignore state_referenced_locally
  let fanOn = $state(preset.fan !== null);
  // svelte-ignore state_referenced_locally
  let fanValue = $state(preset.fan ?? 100);
  let error = $state<PresetError | null>(null);

  const max = $derived(settings.value.temperature.max);

  function save() {
    const result: TemperaturePreset = { ...draft, name: draft.name.trim(), fan: fanOn ? fanValue : null };
    error = validatePreset(result, settings.value.presets, max);
    if (!error) onsave(result);
  }
</script>

<Modal
  title={t(isNew ? 'presets.addTitle' : 'presets.editTitle')}
  icon={Thermometer}
  tone="accent"
  onclose={oncancel}
  width={620}
  testid="preset-editor"
>
  <div class="form">
    <div class="wide">
      <InputField
        label={t('presets.name')}
        bind:value={draft.name}
        maxLength={PRESET_NAME_MAX}
        placeholder={t('presets.namePlaceholder')}
        testid="preset-name"
      />
    </div>
    <InputField
      type="number"
      label={t('heater.tool0')}
      bind:value={draft.hotend}
      unit="°C"
      min={0}
      max={max.hotend}
      testid="preset-hotend"
    />
    <InputField type="number" label={t('heater.bed')} bind:value={draft.bed} unit="°C" min={0} max={max.bed} testid="preset-bed" />
    <div class="fan-toggle" data-testid="preset-fan-toggle">
      <Toggle label={t('presets.setFan')} hint={t('presets.setFanHint')} bind:checked={fanOn} />
    </div>
    <InputField
      type="number"
      label={t('tune.fan')}
      bind:value={fanValue}
      unit="%"
      min={0}
      max={100}
      disabled={!fanOn}
      testid="preset-fan"
    />
  </div>
  {#if error}
    <p class="error" role="alert" data-testid="preset-error">{t(`presets.error.${error}`)}</p>
  {/if}
  {#snippet actions()}
    <Button size="lg" onclick={oncancel}>{t('common.cancel')}</Button>
    <Button variant="primary" size="lg" onclick={save} data-testid="preset-save">{t('common.save')}</Button>
  {/snippet}
</Modal>

<style>
  .form {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-3) var(--sp-4);
    color: var(--text);
    font-size: var(--fs-md);
  }
  .wide {
    grid-column: 1 / -1;
  }
  .fan-toggle {
    align-self: end;
  }
  .error {
    margin: var(--sp-3) 0 0;
    color: var(--error);
    font-size: var(--fs-md);
  }
</style>
