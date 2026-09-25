<script lang="ts">
  // Macro buttons: one tap runs the macro (with confirmation if it asks for one, or while printing).
  import ShieldAlert from '@lucide/svelte/icons/shield-alert';
  import { macroCommands } from '../../lib/core/macros';
  import { t } from '../../lib/i18n/index.svelte';
  import { printer, settings } from '../../lib/stores';
  import { pressable } from '../../lib/ui/press';
  import { runMacro } from './actions';
  import { macroColor, macroIcon } from './macroLook';
</script>

{#if settings.value.macros.length}
  <div class="grid" data-testid="macro-grid">
    {#each settings.value.macros as macro (macro.id)}
      {@const Icon = macroIcon(macro.icon)}
      {@const commands = macroCommands(macro.gcode)}
      <button
        type="button"
        class="macro"
        style:--macro={macroColor(macro.color)}
        disabled={!printer.operational}
        onclick={() => runMacro(macro)}
        data-testid="macro-{macro.id}"
        {@attach pressable}
      >
        <span class="icon"><Icon size={30} strokeWidth={2.2} aria-hidden="true" /></span>
        <span class="text">
          <span class="name">{macro.name}</span>
          <span class="gcode">{commands.slice(0, 2).join(' · ')}{commands.length > 2 ? ' …' : ''}</span>
        </span>
        {#if macro.confirm}
          <span class="confirm" title={t('macros.asksConfirm')}><ShieldAlert size={18} aria-label={t('macros.asksConfirm')} /></span>
        {/if}
      </button>
    {/each}
  </div>
{:else}
  <p class="empty">{t('macros.empty')}</p>
{/if}

<style>
  .grid {
    display: grid;
    flex: 1;
    grid-template-columns: repeat(3, 1fr);
    grid-auto-rows: 104px;
    align-content: start;
    gap: var(--sp-3);
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .macro {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-width: 0;
    padding: 0 var(--sp-4);
    border: 1px solid var(--border);
    border-left: 6px solid var(--macro);
    border-radius: var(--r-lg);
    background: var(--surface);
    text-align: left;
    transition:
      transform var(--dur-fast) var(--ease),
      filter var(--dur-fast) var(--ease);
  }
  .macro:global([data-pressed]) {
    transform: scale(0.97);
    filter: brightness(1.2);
  }
  .macro:disabled {
    opacity: 0.38;
  }
  .icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 56px;
    height: 56px;
    border-radius: var(--r-md);
    background: color-mix(in srgb, var(--macro) 16%, transparent);
    color: var(--macro);
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .name {
    overflow: hidden;
    color: var(--text);
    font-size: var(--fs-lg);
    font-weight: var(--fw-bold);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .gcode {
    overflow: hidden;
    color: var(--text-faint);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .confirm {
    position: absolute;
    top: var(--sp-2);
    right: var(--sp-2);
    color: var(--text-faint);
  }
  .empty {
    margin: auto;
    color: var(--text-faint);
    font-size: var(--fs-lg);
  }
</style>
