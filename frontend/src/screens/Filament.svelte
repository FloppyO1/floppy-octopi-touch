<script lang="ts">
  // Filament: guided wizard (load/unload/M600 change) and manual extrude/retract. Locked during a job,
  // where only the firmware's filament change (M600) is offered.
  import Lock from '@lucide/svelte/icons/lock';
  import RefreshCcw from '@lucide/svelte/icons/refresh-ccw';
  import { t } from '../lib/i18n/index.svelte';
  import { capabilities, printer, terminal } from '../lib/stores';
  import Button from '../lib/ui/Button.svelte';
  import { dialogs } from '../lib/ui/dialogs.svelte';
  import { toast } from '../lib/ui/toast.svelte';
  import FilamentSetup from './filament/FilamentSetup.svelte';
  import { wizard } from './filament/flow.svelte';
  import ManualPanel from './filament/ManualPanel.svelte';
  import Wizard from './filament/Wizard.svelte';

  let setup = $state(false);
  const locked = $derived(!printer.operational || printer.busy);

  async function changeDuringPrint() {
    const ok = await dialogs.confirm({
      title: t('filament.m600Title'),
      message: t('filament.m600Message'),
      confirmLabel: t('filament.change'),
      tone: 'warning',
    });
    if (!ok) return;
    try {
      await terminal.send('M600');
    } catch {
      toast.show(t('filament.failed'), { tone: 'error' });
    }
  }
</script>

<div class="filament">
  {#if printer.busy}
    <div class="locked" data-testid="filament-locked">
      <Lock size={20} aria-hidden="true" />
      <span>{t('filament.locked')}</span>
      {#if capabilities.has('advancedPause') && printer.phase === 'printing'}
        <Button variant="warning" icon={RefreshCcw} onclick={changeDuringPrint} data-testid="m600">{t('filament.change')}</Button>
      {/if}
    </div>
  {/if}
  <div class="grid">
    <Wizard {locked} onsetup={() => (setup = true)} />
    <!-- No manual moves while the wizard drives the extruder. -->
    <ManualPanel locked={locked || wizard.run !== null} />
  </div>
</div>

{#if setup}
  <FilamentSetup onclose={() => (setup = false)} />
{/if}

<style>
  .filament {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    height: 100%;
    padding: var(--sp-3);
  }
  .grid {
    display: grid;
    flex: 1;
    grid-template-columns: 1fr 330px;
    gap: var(--sp-3);
    min-height: 0;
  }
  .locked {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
    min-height: var(--touch);
    padding: 0 var(--sp-2) 0 var(--sp-4);
    border-radius: var(--r-md);
    background: var(--paused-soft);
    color: var(--paused);
  }
  .locked span {
    flex: 1;
  }
</style>
