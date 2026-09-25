<script lang="ts">
  // Preset list: reorder, edit, delete (confirmed), add, restore the defaults (confirmed).
  import ArrowDown from '@lucide/svelte/icons/arrow-down';
  import ArrowUp from '@lucide/svelte/icons/arrow-up';
  import Pencil from '@lucide/svelte/icons/pencil';
  import Plus from '@lucide/svelte/icons/plus';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import SlidersHorizontal from '@lucide/svelte/icons/sliders-horizontal';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { movePreset, removePreset, upsertPreset } from '../../lib/core/presets';
  import { defaultPresets, newId, type TemperaturePreset } from '../../lib/core/settings';
  import { t } from '../../lib/i18n/index.svelte';
  import { settings } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import { dialogs } from '../../lib/ui/dialogs.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import Modal from '../../lib/ui/Modal.svelte';
  import { toast } from '../../lib/ui/toast.svelte';
  import PresetEditor from './PresetEditor.svelte';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let editing = $state<{ preset: TemperaturePreset; isNew: boolean } | null>(null);
  const presets = $derived(settings.value.presets);

  const setPresets = (next: TemperaturePreset[]) => settings.update((s) => (s.presets = next));

  function add() {
    editing = { preset: { id: newId('preset'), name: '', hotend: 200, bed: 60, fan: null }, isNew: true };
  }

  function save(preset: TemperaturePreset) {
    setPresets(upsertPreset(presets, preset));
    editing = null;
    toast.show(t('presets.saved', { name: preset.name }), { tone: 'ok' });
  }

  async function remove(preset: TemperaturePreset) {
    const ok = await dialogs.confirm({
      title: t('presets.deleteTitle'),
      message: t('presets.deleteMessage', { name: preset.name }),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (ok) setPresets(removePreset(presets, preset.id));
  }

  async function restore() {
    const ok = await dialogs.confirm({
      title: t('presets.restoreTitle'),
      message: t('presets.restoreMessage'),
      confirmLabel: t('presets.restore'),
      tone: 'warning',
    });
    if (ok) setPresets(defaultPresets());
  }

  const fanText = (fan: number | null) => (fan === null ? t('presets.fanUnchanged') : `${fan}%`);
</script>

<Modal title={t('presets.title')} icon={SlidersHorizontal} tone="accent" {onclose} width={760} testid="preset-manager">
  {#if presets.length}
    <ol class="list" data-testid="preset-list">
      {#each presets as preset, index (preset.id)}
        <li data-testid="preset-row-{preset.id}">
          <span class="text">
            <span class="name">{preset.name}</span>
            <span class="meta tabular">
              {t('heater.tool0')} {preset.hotend}° · {t('heater.bed')} {preset.bed}° · {t('gauge.fan')} {fanText(preset.fan)}
            </span>
          </span>
          <IconButton icon={ArrowUp} label={t('presets.moveUp')} variant="ghost" disabled={index === 0} onclick={() => setPresets(movePreset(presets, preset.id, -1))} data-testid="preset-up-{preset.id}" />
          <IconButton
            icon={ArrowDown}
            label={t('presets.moveDown')}
            variant="ghost"
            disabled={index === presets.length - 1}
            onclick={() => setPresets(movePreset(presets, preset.id, 1))}
            data-testid="preset-down-{preset.id}"
          />
          <IconButton icon={Pencil} label={t('presets.edit')} onclick={() => (editing = { preset, isNew: false })} data-testid="preset-edit-{preset.id}" />
          <IconButton icon={Trash2} label={t('common.delete')} onclick={() => remove(preset)} data-testid="preset-delete-{preset.id}" />
        </li>
      {/each}
    </ol>
  {:else}
    <p class="empty">{t('presets.empty')}</p>
  {/if}
  {#snippet actions()}
    <Button size="lg" icon={RotateCcw} onclick={restore} data-testid="preset-restore">{t('presets.restore')}</Button>
    <span class="spacer"></span>
    <Button variant="primary" size="lg" icon={Plus} onclick={add} data-testid="preset-add">{t('presets.add')}</Button>
  {/snippet}
</Modal>

{#if editing}
  <PresetEditor preset={editing.preset} isNew={editing.isNew} onsave={save} oncancel={() => (editing = null)} />
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
    padding: var(--sp-1) var(--sp-2) var(--sp-1) var(--sp-4);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-2);
  }
  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    color: var(--text);
    font-weight: var(--fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
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
