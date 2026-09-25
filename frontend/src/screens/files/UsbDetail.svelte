<script lang="ts">
  // A G-code file on a USB stick: thumbnail, info and the destination folder of the import.
  import Box from '@lucide/svelte/icons/box';
  import Download from '@lucide/svelte/icons/download';
  import Usb from '@lucide/svelte/icons/usb';
  import { usbThumbnailUrl } from '../../lib/api/agent';
  import type { UsbFile } from '../../lib/api/types';
  import { folderPaths, parentPath } from '../../lib/core/files';
  import { formatBytes, formatFileDate } from '../../lib/core/format';
  import { i18n, t } from '../../lib/i18n/index.svelte';
  import { files, settings, usb } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import Modal from '../../lib/ui/Modal.svelte';
  import Select from '../../lib/ui/Select.svelte';
  import Thumb from '../../lib/ui/Thumb.svelte';

  interface Props {
    file: UsbFile;
    /** Proposed destination (the local folder open in the browser). */
    folder: string;
    onimport: (folder: string) => void;
    onclose: () => void;
  }

  let { file, folder, onimport, onclose }: Props = $props();

  const folders = $derived(folderPaths(files.local));
  // svelte-ignore state_referenced_locally
  let destination = $state(folderPaths(files.local).includes(folder) ? folder : '');
  const options = $derived([
    { value: '', label: t('files.rootFolder') },
    ...folders.map((path) => ({ value: path, label: path })),
  ]);
  const stick = $derived(usb.mounts.find((m) => m.id === file.mount)?.name ?? file.mount);
</script>

<Modal title={file.name} icon={Usb} width={900} {onclose} testid="usb-detail">
  <div class="detail">
    <div class="preview">
      <Thumb src={usbThumbnailUrl(file.mount, file.path)} icon={Box} iconSize={88} alt={t('preview.thumbnail')} />
    </div>
    <div class="side">
      <dl class="tabular">
        <dt>{t('files.stick')}</dt>
        <dd>{stick}</dd>
        {#if parentPath(file.path)}
          <dt>{t('files.folder')}</dt>
          <dd>{parentPath(file.path)}</dd>
        {/if}
        <dt>{t('files.size')}</dt>
        <dd>{formatBytes(file.size)}</dd>
        <dt>{t('files.modified')}</dt>
        <dd>{formatFileDate(file.date, i18n.locale, !settings.value.clock24h)}</dd>
      </dl>
      <Select label={t('files.destination')} bind:value={destination} {options} testid="usb-destination" />
      <p class="hint">{t('files.usbHint')}</p>
    </div>
  </div>
  {#snippet actions()}
    <Button size="lg" onclick={onclose}>{t('common.close')}</Button>
    <Button
      variant="primary"
      size="lg"
      icon={Download}
      disabled={usb.importing !== null}
      onclick={() => onimport(destination)}
      data-testid="usb-import"
    >
      {t('files.import')}
    </Button>
  {/snippet}
</Modal>

<style>
  .detail {
    display: grid;
    grid-template-columns: 400px 1fr;
    gap: var(--sp-5);
    align-items: start;
  }
  .preview {
    height: 280px;
    border-radius: var(--r-md);
    overflow: hidden;
  }
  .side {
    display: flex;
    flex-direction: column;
    gap: var(--sp-4);
    min-width: 0;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--sp-3) var(--sp-4);
    margin: 0;
    font-size: var(--fs-md);
  }
  dt {
    color: var(--text-dim);
  }
  dd {
    margin: 0;
    color: var(--text);
    font-weight: var(--fw-medium);
    overflow-wrap: anywhere;
  }
  .hint {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--fs-sm);
  }
</style>
