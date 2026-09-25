<script lang="ts">
  // Power and lights: PSU Control in the status bar and the custom action buttons.
  import Pencil from '@lucide/svelte/icons/pencil';
  import Power from '@lucide/svelte/icons/power';
  import Zap from '@lucide/svelte/icons/zap';
  import { t } from '../../../lib/i18n/index.svelte';
  import { power, settings } from '../../../lib/stores';
  import Button from '../../../lib/ui/Button.svelte';
  import Card from '../../../lib/ui/Card.svelte';
  import Toggle from '../../../lib/ui/Toggle.svelte';
  import { macroColor, macroIcon } from '../../terminal/macroLook';
  import ActionManager from '../ActionManager.svelte';
  import { actionSummary } from '../actions';

  let managing = $state(false);
  const list = $derived(settings.value.customActions);
</script>

<Card title={t('power.psu')} icon={Power}>
  {#if power.available}
    <div data-testid="psu-statusbar-setting">
      <Toggle
        label={t('power.psuStatusBar')}
        hint={t('power.psuStatusBarHint')}
        checked={settings.value.psu.statusBar}
        onchange={(on) => settings.update((s) => (s.psu.statusBar = on))}
      />
    </div>
  {:else}
    <p class="hint">{t('power.noPsu')}</p>
  {/if}
</Card>

<Card title={t('actions.title')} icon={Zap}>
  {#snippet actions()}
    <Button icon={Pencil} onclick={() => (managing = true)} data-testid="settings-actions-manage">{t('presets.manage')}</Button>
  {/snippet}
  <p class="hint">{t('actions.intro')}</p>
  {#if list.length}
    <ul class="list">
      {#each list as action (action.id)}
        {@const Icon = macroIcon(action.icon)}
        <li>
          <span class="icon" style:color={macroColor(action.color)}><Icon size={22} aria-hidden="true" /></span>
          <span class="name">{action.name}</span>
          <span class="meta">{t(`actions.kind.${action.kind}`)} · {actionSummary(action)}</span>
        </li>
      {/each}
    </ul>
  {/if}
</Card>

{#if managing}
  <ActionManager onclose={() => (managing = false)} />
{/if}

<style>
  .hint {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--fs-md);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: 40px;
  }
  .icon {
    display: grid;
  }
  .name {
    color: var(--text);
    font-weight: var(--fw-bold);
  }
  .meta {
    overflow: hidden;
    color: var(--text-dim);
    font-size: var(--fs-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
