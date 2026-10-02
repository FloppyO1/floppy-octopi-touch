<script lang="ts">
  // Once per start, after connecting (never during a print): OctoPrint's script after Stop leaves
  // something on. "Don't ask again" is saved (settings.stopScript.remind), also in Settings → Motion.
  import OctagonX from '@lucide/svelte/icons/octagon-x';
  import Wrench from '@lucide/svelte/icons/wrench';
  import { t } from '../lib/i18n/index.svelte';
  import { connection, printer, settings, stopScript } from '../lib/stores';
  import Button from '../lib/ui/Button.svelte';
  import Modal from '../lib/ui/Modal.svelte';
  import { fixStopScript } from '../screens/system/actions';

  const ITEMS = ['motors', 'hotends', 'bed', 'fan'] as const;

  let asked = false;
  let open = $state(false);

  $effect(() => {
    if (asked) return;
    const missing = stopScript.status?.missing.length ?? 0;
    if (connection.live && settings.status !== 'loading' && settings.value.stopScript.remind && !printer.busy && missing) {
      asked = true;
      open = true;
    }
  });

  const items = $derived(
    ITEMS.filter((item) => stopScript.status?.[item] === 'missing')
      .map((item) => t(`stopScript.item.${item}`))
      .join(', '),
  );

  function never() {
    open = false;
    settings.update((v) => (v.stopScript.remind = false));
  }

  function fix() {
    open = false;
    void fixStopScript();
  }
</script>

{#if open && stopScript.status?.missing.length}
  <Modal title={t('stopScript.noticeTitle')} icon={OctagonX} tone="warning" width={600} testid="stop-script-notice" onclose={() => (open = false)}>
    <p>{t('stopScript.noticeMessage', { items })}</p>
    <p class="hint">{t('stopScript.hint')}</p>
    {#snippet actions()}
      <Button size="lg" onclick={never} data-testid="stop-script-never">{t('stopScript.never')}</Button>
      <Button size="lg" onclick={() => (open = false)} data-testid="stop-script-later">{t('stopScript.notNow')}</Button>
      <Button variant="primary" size="lg" icon={Wrench} onclick={fix} data-testid="stop-script-notice-fix">{t('stopScript.fix')}</Button>
    {/snippet}
  </Modal>
{/if}

<style>
  p {
    margin: 0;
    line-height: 1.4;
  }
  .hint {
    margin-top: var(--sp-2);
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
</style>
