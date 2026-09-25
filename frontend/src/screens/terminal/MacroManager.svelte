<script lang="ts">
  // Macro list: reorder, edit, delete (confirmed), add, restore the defaults (confirmed).
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Plus from '@lucide/svelte/icons/plus';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import SquareTerminal from '@lucide/svelte/icons/square-terminal';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { moveById, removeById, upsertById } from '../../lib/core/lists';
  import { macroCommands } from '../../lib/core/macros';
  import { defaultMacros, newId, type Macro } from '../../lib/core/settings';
  import { t } from '../../lib/i18n/index.svelte';
  import { settings } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import { dialogs } from '../../lib/ui/dialogs.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import Modal from '../../lib/ui/Modal.svelte';
  import { toast } from '../../lib/ui/toast.svelte';
  import MacroEditor from './MacroEditor.svelte';
  import { macroColor, macroIcon } from './macroLook';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let editing = $state<{ macro: Macro; isNew: boolean } | null>(null);
  const macros = $derived(settings.value.macros);

  const setMacros = (next: Macro[]) => settings.update((s) => (s.macros = next));

  function add() {
    editing = {
      macro: { id: newId('macro'), name: '', icon: 'play', color: 'accent', gcode: '', confirm: false },
      isNew: true,
    };
  }

  function save(macro: Macro) {
    setMacros(upsertById(macros, macro));
    editing = null;
    toast.show(t('macros.saved', { name: macro.name }), { tone: 'ok' });
  }

  async function remove(macro: Macro) {
    const ok = await dialogs.confirm({
      title: t('macros.deleteTitle'),
      message: t('macros.deleteMessage', { name: macro.name }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (ok) setMacros(removeById(macros, macro.id));
  }

  async function restore() {
    const ok = await dialogs.confirm({
      title: t('macros.restoreTitle'),
      message: t('macros.restoreMessage'),
      confirmLabel: t('presets.restore'),
      tone: 'warning',
    });
    if (ok) setMacros(defaultMacros());
  }
</script>

<Modal title={t('macros.title')} icon={SquareTerminal} tone="accent" {onclose} width={760} testid="macro-manager">
  {#if macros.length}
    <ol class="list" data-testid="macro-list">
      {#each macros as macro, index (macro.id)}
        {@const Icon = macroIcon(macro.icon)}
        <li data-testid="macro-row-{macro.id}">
          <span class="icon" style:color={macroColor(macro.color)}><Icon size={24} aria-hidden="true" /></span>
          <span class="text">
            <span class="name">{macro.name}</span>
            <span class="meta">
              {t('macros.commands', { count: macroCommands(macro.gcode).length })}
              {#if macro.confirm}· <ShieldAlert size={14} aria-hidden="true" /> {t('macros.asksConfirm')}{/if}
            </span>
          </span>
          <IconButton icon={ArrowUp} label={t('presets.moveUp')} variant="ghost" disabled={index === 0} onclick={() => setMacros(moveById(macros, macro.id, -1))} data-testid="macro-up-{macro.id}" />
          <IconButton
            icon={ArrowDown}
            label={t('presets.moveDown')}
            variant="ghost"
            disabled={index === macros.length - 1}
            onclick={() => setMacros(moveById(macros, macro.id, 1))}
            data-testid="macro-down-{macro.id}"
          />
          <IconButton icon={Pencil} label={t('macros.edit')} onclick={() => (editing = { macro, isNew: false })} data-testid="macro-edit-{macro.id}" />
          <IconButton icon={Trash2} label={t('common.delete')} onclick={() => remove(macro)} data-testid="macro-delete-{macro.id}" />
        </li>
      {/each}
    </ol>
  {:else}
    <p class="empty">{t('macros.empty')}</p>
  {/if}
  {#snippet actions()}
    <Button size="lg" icon={RotateCcw} onclick={restore} data-testid="macro-restore">{t('presets.restore')}</Button>
    <span class="spacer"></span>
    <Button variant="primary" size="lg" icon={Plus} onclick={add} data-testid="macro-add">{t('macros.add')}</Button>
  {/snippet}
</Modal>

{#if editing}
  <MacroEditor macro={editing.macro} isNew={editing.isNew} onsave={save} oncancel={() => (editing = null)} />
{/if}

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-height: 330px;
    margin: 0;
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
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .empty {
    margin: 0;
    text-align: center;
  }
  .spacer {
    flex: 1;
  }
</style>
