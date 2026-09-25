<script lang="ts">
  // Create or edit one macro: name, G-code lines (G-code keyboard), confirmation, icon and colour.
  import SquareTerminal from '@lucide/svelte/icons/square-terminal';
  import { MACRO_NAME_MAX, validateMacro, type MacroError } from '../../lib/core/macros';
  import type { Macro } from '../../lib/core/settings';
  import { t } from '../../lib/i18n/index.svelte';
  import { settings } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import InputField from '../../lib/ui/InputField.svelte';
  import Modal from '../../lib/ui/Modal.svelte';
  import Toggle from '../../lib/ui/Toggle.svelte';
  import LookPicker from './LookPicker.svelte';

  interface Props {
    macro: Macro;
    isNew: boolean;
    onsave: (macro: Macro) => void;
    oncancel: () => void;
  }

  let { macro, isNew, onsave, oncancel }: Props = $props();

  // svelte-ignore state_referenced_locally
  let draft = $state({ ...macro });
  let error = $state<MacroError | null>(null);

  function save() {
    const result: Macro = { ...draft, name: draft.name.trim(), gcode: draft.gcode.trim() };
    error = validateMacro(result, settings.value.macros);
    if (!error) onsave(result);
  }
</script>

<Modal
  title={t(isNew ? 'macros.addTitle' : 'macros.editTitle')}
  icon={SquareTerminal}
  tone="accent"
  onclose={oncancel}
  width={780}
  testid="macro-editor"
>
  <div class="form">
    <div class="main">
      <InputField
        label={t('macros.name')}
        bind:value={draft.name}
        maxLength={MACRO_NAME_MAX}
        placeholder={t('macros.namePlaceholder')}
        testid="macro-name"
      />
      <InputField type="gcode" multiline label={t('macros.gcode')} bind:value={draft.gcode} placeholder="G28" testid="macro-gcode" />
      <p class="hint">{t('macros.gcodeHint')}</p>
      <div data-testid="macro-confirm">
        <Toggle label={t('macros.confirm')} hint={t('macros.confirmHint')} bind:checked={draft.confirm} />
      </div>
    </div>
    <LookPicker bind:icon={draft.icon} bind:color={draft.color} testid="macro" />
  </div>
  {#if error}
    <p class="error" role="alert" data-testid="macro-error">{t(`macros.error.${error}`)}</p>
  {/if}
  {#snippet actions()}
    <Button size="lg" onclick={oncancel}>{t('common.cancel')}</Button>
    <Button variant="primary" size="lg" onclick={save} data-testid="macro-save">{t('common.save')}</Button>
  {/snippet}
</Modal>

<style>
  .form {
    display: grid;
    grid-template-columns: 1fr 264px;
    gap: var(--sp-5);
    color: var(--text);
    font-size: var(--fs-md);
  }
  .main {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-width: 0;
  }
  .hint {
    margin: calc(-1 * var(--sp-2)) 0 0;
    color: var(--text-faint);
    font-size: var(--fs-sm);
  }
  .error {
    margin: var(--sp-3) 0 0;
    color: var(--error);
    font-size: var(--fs-md);
  }
</style>
