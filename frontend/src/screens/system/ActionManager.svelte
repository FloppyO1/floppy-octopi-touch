<script lang="ts">
  // Power and lights: the PSU switch in the status bar and the custom actions (reorder, edit,
  // delete with confirmation, add).
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import PanelTop from '@lucide/svelte/icons/panel-top';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Plus from '@lucide/svelte/icons/plus';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import Zap from '@lucide/svelte/icons/zap';
  import { moveById, removeById, upsertById } from '../../lib/core/lists';
  import { newAction, type CustomAction } from '../../lib/core/power';
  import { newId } from '../../lib/core/settings';
  import { t } from '../../lib/i18n/index.svelte';
  import { power, settings } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import { dialogs } from '../../lib/ui/dialogs.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import Modal from '../../lib/ui/Modal.svelte';
  import { toast } from '../../lib/ui/toast.svelte';
  import Toggle from '../../lib/ui/Toggle.svelte';
  import { macroColor, macroIcon } from '../terminal/macroLook';
  import ActionEditor from './ActionEditor.svelte';
  import { actionSummary } from './actions';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let editing = $state<{ action: CustomAction; isNew: boolean } | null>(null);
  const list = $derived(settings.value.customActions);

  const setList = (next: CustomAction[]) => settings.update((s) => (s.customActions = next));

  function save(action: CustomAction) {
    setList(upsertById(list, action));
    editing = null;
    toast.show(t('macros.saved', { name: action.name }), { tone: 'ok' });
  }

  async function remove(action: CustomAction) {
    const ok = await dialogs.confirm({
      title: t('actions.deleteTitle'),
      message: t('macros.deleteMessage', { name: action.name }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (ok) setList(removeById(list, action.id));
  }
</script>

<Modal title={t('power.title')} icon={Zap} tone="accent" {onclose} width={760} testid="action-manager">
  {#if power.available}
    <div data-testid="psu-statusbar">
      <Toggle
        label={t('power.psuStatusBar')}
        hint={t('power.psuStatusBarHint')}
        checked={settings.value.psu.statusBar}
        onchange={(on) => settings.update((s) => (s.psu.statusBar = on))}
      />
    </div>
  {:else}
    <p class="note">{t('power.noPsu')}</p>
  {/if}
  {#if list.length}
    <ol class="list" data-testid="action-list">
      {#each list as action, index (action.id)}
        {@const Icon = macroIcon(action.icon)}
        <li data-testid="action-row-{action.id}">
          <span class="icon" style:color={macroColor(action.color)}><Icon size={24} aria-hidden="true" /></span>
          <span class="text">
            <span class="name">{action.name}</span>
            <span class="meta">
              {t(`actions.kind.${action.kind}`)} · {actionSummary(action)}
              {#if action.confirm}· <ShieldAlert size={14} aria-hidden="true" />{/if}
              {#if action.statusBar}· <PanelTop size={14} aria-hidden="true" />{/if}
            </span>
          </span>
          <IconButton icon={ArrowUp} label={t('presets.moveUp')} variant="ghost" disabled={index === 0} onclick={() => setList(moveById(list, action.id, -1))} />
          <IconButton icon={ArrowDown} label={t('presets.moveDown')} variant="ghost" disabled={index === list.length - 1} onclick={() => setList(moveById(list, action.id, 1))} />
          <IconButton icon={Pencil} label={t('actions.edit')} onclick={() => (editing = { action, isNew: false })} data-testid="action-edit-{action.id}" />
          <IconButton icon={Trash2} label={t('common.delete')} onclick={() => remove(action)} data-testid="action-delete-{action.id}" />
        </li>
      {/each}
    </ol>
  {:else}
    <p class="note">{t('actions.empty')}</p>
  {/if}
  {#snippet actions()}
    <span class="spacer"></span>
    <Button variant="primary" size="lg" icon={Plus} onclick={() => (editing = { action: newAction(newId('action')), isNew: true })} data-testid="action-add">
      {t('actions.add')}
    </Button>
  {/snippet}
</Modal>

{#if editing}
  <ActionEditor action={editing.action} isNew={editing.isNew} onsave={save} oncancel={() => (editing = null)} />
{/if}

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-height: 300px;
    margin: var(--sp-2) 0 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
    overscroll-behavior: contain;
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--sp-1);
    min-height: 68px;
    padding: var(--sp-1) var(--sp-2) var(--sp-1) var(--sp-3);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-2);
  }
  .icon {
    display: grid;
    place-items: center;
    width: 40px;
  }
  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    margin-left: var(--sp-2);
  }
  .name {
    overflow: hidden;
    color: var(--text);
    font-weight: var(--fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
    color: var(--text-dim);
    font-size: var(--fs-sm);
    white-space: nowrap;
  }
  .note {
    margin: var(--sp-2) 0 0;
    color: var(--text-dim);
    font-size: var(--fs-md);
  }
  .spacer {
    flex: 1;
  }
</style>
