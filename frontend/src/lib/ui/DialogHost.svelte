<script lang="ts">
  import ConfirmDialog from './ConfirmDialog.svelte';
  import { dialogs } from './dialogs.svelte';
  import NumPad from './NumPad.svelte';
  import SliderDialog from './SliderDialog.svelte';
  import TextInputSheet from './TextInputSheet.svelte';
</script>

{#each dialogs.stack as dialog (dialog.id)}
  {#if dialog.kind === 'confirm'}
    <ConfirmDialog
      {...dialog.request}
      onconfirm={() => dialogs.close(dialog.id, true)}
      oncancel={() => dialogs.close(dialog.id, false)}
    />
  {:else if dialog.kind === 'number'}
    <NumPad
      {...dialog.request}
      onsubmit={(value) => dialogs.close(dialog.id, value)}
      oncancel={() => dialogs.close(dialog.id, null)}
    />
  {:else if dialog.kind === 'slider'}
    <SliderDialog
      {...dialog.request}
      onsubmit={(value) => dialogs.close(dialog.id, value)}
      oncancel={() => dialogs.close(dialog.id, null)}
    />
  {:else}
    <TextInputSheet
      {...dialog.request}
      onsubmit={(value) => dialogs.close(dialog.id, value)}
      oncancel={() => dialogs.close(dialog.id, null)}
    />
  {/if}
{/each}
