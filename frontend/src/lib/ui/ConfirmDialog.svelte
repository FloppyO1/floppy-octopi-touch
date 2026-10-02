<script lang="ts">
  import CircleAlert from '@lucide/svelte/icons/circle-alert';
  import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
  import { t } from '../i18n/index.svelte';
  import Button from './Button.svelte';
  import Modal from './Modal.svelte';

  interface Props {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string | null;
    /** `danger` for destructive actions (stop print, delete), `warning` for risky ones. */
    tone?: 'primary' | 'danger' | 'warning';
    onconfirm: () => void;
    oncancel: () => void;
  }

  let { title, message, confirmLabel, cancelLabel, tone = 'primary', onconfirm, oncancel }: Props = $props();
</script>

<Modal
  {title}
  icon={tone === 'primary' ? CircleAlert : TriangleAlert}
  tone={tone === 'primary' ? 'accent' : tone}
  width={520}
  layer="top"
  testid="confirm-dialog"
  onclose={oncancel}
>
  {#if message}<p>{message}</p>{/if}
  {#snippet actions()}
    {#if cancelLabel !== null}
      <Button variant="secondary" size="lg" onclick={oncancel}>{cancelLabel ?? t('common.cancel')}</Button>
    {/if}
    <Button variant={tone} size="lg" onclick={onconfirm}>{confirmLabel ?? t('common.confirm')}</Button>
  {/snippet}
</Modal>

<style>
  p {
    margin: 0;
    line-height: 1.4;
    white-space: pre-line;
  }
</style>
