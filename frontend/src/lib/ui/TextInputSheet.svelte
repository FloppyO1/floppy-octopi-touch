<script lang="ts">
  import Check from '@lucide/svelte/icons/check';
  import X from '@lucide/svelte/icons/x';
  import { tick } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { editText, type KeyboardLayer, type KeyboardLocale } from '../core/keyboard';
  import { i18n, t } from '../i18n/index.svelte';
  import Button from './Button.svelte';
  import OnScreenKeyboard from './OnScreenKeyboard.svelte';

  interface Props {
    title: string;
    value?: string;
    layer?: KeyboardLayer;
    multiline?: boolean;
    maxLength?: number;
    placeholder?: string;
    onsubmit: (value: string) => void;
    oncancel: () => void;
  }

  let {
    title,
    value = '',
    layer = 'letters',
    multiline = false,
    maxLength,
    placeholder = '',
    onsubmit,
    oncancel,
  }: Props = $props();

  // svelte-ignore state_referenced_locally
  let text = $state(value);
  let box: HTMLDivElement;
  const locale = $derived<KeyboardLocale>(i18n.locale === 'it' ? 'it' : 'en');
  const options = $derived({ multiline, maxLength });

  async function update(next: string) {
    text = next;
    await tick();
    box?.scrollTo({ top: box.scrollHeight });
  }

  function onkey(key: 'backspace' | 'enter' | 'space') {
    if (key === 'enter' && !multiline) onsubmit(text);
    else void update(editText(text, { key }, options));
  }

  function keydown(event: KeyboardEvent) {
    // Physical keyboard in dev.
    if (event.key === 'Escape') oncancel();
    else if (event.key === 'Backspace') onkey('backspace');
    else if (event.key === 'Enter') onkey('enter');
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
      void update(editText(text, { char: event.key }, options));
    } else return;
    event.preventDefault();
  }
</script>

<svelte:window onkeydown={keydown} />

<div class="sheet" role="dialog" aria-modal="true" aria-label={title} data-testid="text-input" transition:fade|global={{ duration: 120 }}>
  <div class="top">
    <header>
      <Button variant="ghost" icon={X} aria-label={t('common.cancel')} onclick={oncancel} />
      <h2>{title}</h2>
      <Button variant="secondary" onclick={() => update('')} disabled={!text}>{t('common.clear')}</Button>
      <Button variant="primary" icon={Check} onclick={() => onsubmit(text)} data-testid="text-input-ok">
        {t('common.ok')}
      </Button>
    </header>
    <div class="field" class:multiline class:mono={layer === 'gcode'} bind:this={box} data-testid="text-input-value">
      {#if text}{text}{:else}<span class="placeholder">{placeholder}</span>{/if}<span class="caret"></span>
    </div>
    {#if maxLength}
      <p class="count tabular">{[...text].length}/{maxLength}</p>
    {/if}
  </div>
  <div class="kb" transition:fly|global={{ y: 320, duration: 200, easing: cubicOut }}>
    <OnScreenKeyboard
      {layer}
      {locale}
      {multiline}
      onchar={(char) => update(editText(text, { char }, options))}
      {onkey}
    />
  </div>
</div>

<style>
  .sheet {
    position: fixed;
    inset: 0;
    z-index: var(--z-keyboard);
    display: flex;
    flex-direction: column;
    background: var(--backdrop);
  }
  .top {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    min-height: 0;
    padding: var(--sp-3) var(--sp-4);
    background: var(--bg);
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
  }
  .field {
    flex: 1;
    min-height: 64px;
    max-height: 100%;
    padding: var(--sp-3) var(--sp-4);
    border: 2px solid var(--accent);
    border-radius: var(--r-md);
    background: var(--surface);
    font-size: var(--fs-2xl);
    line-height: 1.25;
    white-space: pre;
    overflow: auto hidden;
  }
  .field:not(.multiline) {
    flex: none;
    display: flex;
    align-items: center;
    height: 72px;
  }
  .multiline {
    font-size: var(--fs-xl);
    white-space: pre-wrap;
    overflow: hidden auto;
    word-break: break-all;
  }
  .mono {
    font-family: var(--font-mono);
  }
  .placeholder {
    color: var(--text-faint);
  }
  .caret {
    display: inline-block;
    width: 3px;
    height: 1.1em;
    margin-left: 2px;
    vertical-align: text-bottom;
    background: var(--accent);
    animation: blink 1s steps(1) infinite;
  }
  .count {
    margin: 0;
    text-align: right;
    font-size: var(--fs-sm);
    color: var(--text-dim);
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
</style>
