<script lang="ts">
  // Create or edit a custom power/lights action: name, what it does (G-code, OctoPrint system
  // command or plugin API call), confirmation, status bar, icon and colour.
  import Zap from '@lucide/svelte/icons/zap';
  import { ACTION_NAME_MAX, STATUS_BAR_MAX_ACTIONS, validateAction, type ActionError, type ActionKind, type CustomAction } from '../../lib/core/power';
  import { t } from '../../lib/i18n/index.svelte';
  import { settings, system } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import InputField from '../../lib/ui/InputField.svelte';
  import Modal from '../../lib/ui/Modal.svelte';
  import Segmented from '../../lib/ui/Segmented.svelte';
  import Select from '../../lib/ui/Select.svelte';
  import Toggle from '../../lib/ui/Toggle.svelte';
  import LookPicker from '../terminal/LookPicker.svelte';

  interface Props {
    action: CustomAction;
    isNew: boolean;
    onsave: (action: CustomAction) => void;
    oncancel: () => void;
  }

  let { action, isNew, onsave, oncancel }: Props = $props();

  // svelte-ignore state_referenced_locally
  let draft = $state(structuredClone($state.snapshot(action)));
  let error = $state<ActionError | null>(null);

  const kinds = $derived<{ value: ActionKind; label: string }[]>(
    (['gcode', 'system', 'plugin'] as const).map((value) => ({ value, label: t(`actions.kind.${value}`) })),
  );
  const commandOptions = $derived(
    (system.commands ?? []).map((c) => ({ value: `${c.source}/${c.action}`, label: c.name })),
  );
  let systemValue = $state(draft.system.source ? `${draft.system.source}/${draft.system.action}` : '');

  if (!system.commands) void system.loadCommands();

  function chooseCommand(value: string) {
    const [source, ...rest] = value.split('/');
    draft.system = { source, action: rest.join('/') };
  }

  function save() {
    const result: CustomAction = {
      ...draft,
      name: draft.name.trim(),
      gcode: draft.gcode.trim(),
      plugin: { id: draft.plugin.id.trim(), command: draft.plugin.command.trim(), data: draft.plugin.data.trim() },
    };
    error = validateAction(result, settings.value.customActions);
    if (!error) onsave(result);
  }
</script>

<Modal title={t(isNew ? 'actions.addTitle' : 'actions.editTitle')} icon={Zap} tone="accent" onclose={oncancel} width={820} testid="action-editor">
  <div class="form">
    <div class="main">
      <InputField label={t('actions.name')} bind:value={draft.name} maxLength={ACTION_NAME_MAX} placeholder={t('actions.namePlaceholder')} testid="action-name" />
      <Segmented label={t('actions.kind')} bind:value={draft.kind} options={kinds} testid="action-kind" />
      {#if draft.kind === 'gcode'}
        <InputField type="gcode" multiline label={t('macros.gcode')} bind:value={draft.gcode} placeholder="M355 S1" testid="action-gcode" />
        <p class="hint">{t('actions.gcodeHint')}</p>
      {:else if draft.kind === 'system'}
        {#if commandOptions.length}
          <Select label={t('actions.systemCommand')} bind:value={systemValue} options={commandOptions} onchange={chooseCommand} testid="action-system" />
          <p class="hint">{t('actions.systemHint')}</p>
        {:else}
          <p class="hint">{t('actions.noSystemCommands')}</p>
        {/if}
      {:else}
        <div class="pair">
          <InputField label={t('actions.pluginId')} bind:value={draft.plugin.id} placeholder="psucontrol" maxLength={64} testid="action-plugin-id" />
          <InputField label={t('actions.pluginCommand')} bind:value={draft.plugin.command} placeholder="togglePSU" maxLength={64} testid="action-plugin-command" />
        </div>
        <InputField label={t('actions.pluginData')} bind:value={draft.plugin.data} placeholder={'{"pin": 17}'} maxLength={500} testid="action-plugin-data" />
        <p class="hint">{t('actions.pluginHint')}</p>
      {/if}
      <div data-testid="action-confirm">
        <Toggle label={t('macros.confirm')} hint={t('actions.confirmHint')} bind:checked={draft.confirm} />
      </div>
      <div data-testid="action-statusbar">
        <Toggle label={t('actions.statusBar')} hint={t('actions.statusBarHint', { max: STATUS_BAR_MAX_ACTIONS })} bind:checked={draft.statusBar} />
      </div>
    </div>
    <LookPicker bind:icon={draft.icon} bind:color={draft.color} testid="action" />
  </div>
  {#snippet actions()}
    <!-- In the footer: the form scrolls, the footer is always visible. -->
    <p class="error" role="alert" data-testid="action-error">
      {#if error}{t(`actions.error.${error}`, { max: STATUS_BAR_MAX_ACTIONS })}{/if}
    </p>
    <Button size="lg" onclick={oncancel}>{t('common.cancel')}</Button>
    <Button variant="primary" size="lg" onclick={save} data-testid="action-save">{t('common.save')}</Button>
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
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-3);
  }
  .hint {
    margin: calc(-1 * var(--sp-2)) 0 0;
    color: var(--text-faint);
    font-size: var(--fs-sm);
  }
  .error {
    flex: 1;
    margin: 0;
    color: var(--error);
    font-size: var(--fs-md);
  }
</style>
