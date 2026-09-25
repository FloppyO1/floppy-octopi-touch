<script lang="ts">
  import MessageSquareWarning from '@lucide/svelte/icons/message-square-warning';
  import type { HostPrompt } from '../core/hostActions';
  import { t } from '../i18n/index.svelte';
  import Button from './Button.svelte';
  import Modal from './Modal.svelte';

  interface Props {
    prompt: HostPrompt;
    /** Index of the chosen button (sent to the firmware as M876 S<index>). */
    onanswer: (choice: number) => void;
    /** Only offered when the firmware gave no choices. */
    ondismiss?: () => void;
  }

  let { prompt, onanswer, ondismiss }: Props = $props();
  let sent = $state(false);

  function answer(index: number) {
    if (sent) return;
    sent = true;
    onanswer(index);
  }
</script>

<!-- No backdrop close: the firmware waits for an answer. -->
<Modal title={t('prompt.title')} icon={MessageSquareWarning} tone="warning" width={640} layer="top" testid="prompt">
  <p class="text">{prompt.text}</p>
  <div class="choices" class:many={prompt.choices.length > 2}>
    {#each prompt.choices as choice, index (index)}
      <Button variant={index === 0 ? 'primary' : 'secondary'} size="lg" block disabled={sent} onclick={() => answer(index)}>
        {choice}
      </Button>
    {:else}
      <Button variant="secondary" size="lg" block onclick={() => ondismiss?.()}>{t('common.close')}</Button>
    {/each}
  </div>
</Modal>

<style>
  .text {
    margin: 0 0 var(--sp-5);
    color: var(--text);
    font-size: var(--fs-xl);
    line-height: 1.35;
    white-space: pre-line;
  }
  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: var(--sp-3);
  }
  .many {
    grid-template-columns: 1fr;
  }
</style>
