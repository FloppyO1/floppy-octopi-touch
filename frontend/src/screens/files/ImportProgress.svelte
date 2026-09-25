<script lang="ts">
  // Blocking progress of a USB import; only "Cancel" closes it before the end.
  import Download from '@lucide/svelte/icons/download';
  import type { UsbImport } from '../../lib/stores/usb.svelte';
  import { formatBytes } from '../../lib/core/format';
  import { t } from '../../lib/i18n/index.svelte';
  import { usb } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import Modal from '../../lib/ui/Modal.svelte';

  let { progress }: { progress: UsbImport } = $props();

  const percent = $derived(progress.total ? Math.min(100, (progress.sent / progress.total) * 100) : 0);
</script>

<Modal title={t('files.importing')} icon={Download} tone="accent" width={560} testid="import-progress">
  <p class="name">{progress.file.name}</p>
  <div class="bar"><div class="fill" style:width="{percent}%"></div></div>
  <p class="numbers tabular">
    <span>{t('files.importProgress', { sent: formatBytes(progress.sent), total: formatBytes(progress.total) })}</span>
    <b>{percent.toFixed(0)}%</b>
  </p>
  {#snippet actions()}
    <Button size="lg" onclick={() => usb.cancelImport()} data-testid="import-cancel">{t('common.cancel')}</Button>
  {/snippet}
</Modal>

<style>
  p {
    margin: 0;
  }
  .name {
    margin-bottom: var(--sp-3);
    color: var(--text);
    font-weight: var(--fw-medium);
    overflow-wrap: anywhere;
  }
  .bar {
    height: 14px;
    border-radius: var(--r-pill);
    background: var(--surface-3);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    transition: width 250ms linear;
  }
  .numbers {
    display: flex;
    justify-content: space-between;
    margin-top: var(--sp-2);
    font-size: var(--fs-md);
  }
  .numbers b {
    color: var(--text);
  }
</style>
