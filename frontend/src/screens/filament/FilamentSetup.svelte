<script lang="ts">
  // Extruder setup used by the wizard: type, bowden length, lengths and speeds. Saving marks the
  // settings as reviewed (`filament.configured`), which silences the wizard's first-use warning.
  import Settings2 from '@lucide/svelte/icons/settings-2';
  import type { ExtruderType } from '../../lib/core/settings';
  import { t } from '../../lib/i18n/index.svelte';
  import { settings } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import InputField from '../../lib/ui/InputField.svelte';
  import Modal from '../../lib/ui/Modal.svelte';
  import Select from '../../lib/ui/Select.svelte';
  import Toggle from '../../lib/ui/Toggle.svelte';
  import { toast } from '../../lib/ui/toast.svelte';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let draft = $state({ ...settings.value.filament });
  const types = $derived<{ value: ExtruderType; label: string }[]>(
    (['direct', 'bowden', 'unknown'] as const).map((value) => ({ value, label: t(`extruder.${value}`) })),
  );

  function save() {
    settings.update((s) => {
      Object.assign(s.filament, draft, {
        configured: true,
        bowdenLength: draft.extruderType === 'bowden' ? draft.bowdenLength : 0,
      });
    });
    toast.show(t('extruder.saved'), { tone: 'ok' });
    onclose();
  }
</script>

<Modal title={t('extruder.title')} icon={Settings2} tone="accent" {onclose} width={900} testid="filament-setup">
  <div class="form">
    <Select label={t('extruder.type')} bind:value={draft.extruderType} options={types} testid="extruder-type" />
    <InputField
      type="number"
      label={t('extruder.bowdenLength')}
      bind:value={draft.bowdenLength}
      unit=" mm"
      min={0}
      max={1500}
      disabled={draft.extruderType !== 'bowden'}
      testid="extruder-bowden"
    />
    <InputField type="number" label={t('extruder.loadSlowLength')} bind:value={draft.loadSlowLength} unit=" mm" min={0} max={200} />
    <InputField type="number" label={t('extruder.unloadLength')} bind:value={draft.unloadLength} unit=" mm" min={0} max={200} />
    <InputField type="number" label={t('extruder.slowFeedrate')} bind:value={draft.slowFeedrate} unit=" mm/min" min={30} max={1200} />
    <InputField type="number" label={t('extruder.fastFeedrate')} bind:value={draft.fastFeedrate} unit=" mm/min" min={60} max={6000} />
    <InputField type="number" label={t('extruder.purgeLength')} bind:value={draft.purgeLength} unit=" mm" min={0} max={200} />
    <InputField type="number" label={t('extruder.minTemp')} bind:value={draft.minTemp} unit="°C" min={0} max={300} testid="extruder-mintemp" />
    <div class="wide" data-testid="extruder-cooldown">
      <Toggle label={t('extruder.coolDownAtEnd')} hint={t('extruder.coolDownAtEndHint')} bind:checked={draft.coolDownAtEnd} />
    </div>
  </div>
  <p class="hint">{t('extruder.hint')}</p>
  {#snippet actions()}
    <Button size="lg" onclick={onclose}>{t('common.cancel')}</Button>
    <Button variant="primary" size="lg" onclick={save} data-testid="extruder-save">{t('common.save')}</Button>
  {/snippet}
</Modal>

<style>
  .form {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--sp-2) var(--sp-4);
    color: var(--text);
    font-size: var(--fs-md);
  }
  .wide {
    grid-column: 1 / -1;
  }
  .hint {
    margin: var(--sp-3) 0 0;
    color: var(--text-faint);
    font-size: var(--fs-sm);
  }
</style>
