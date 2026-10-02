<script lang="ts">
  // Live serial log (filtered, auto-scroll that stops when scrolled up, pause) with the command input:
  // in-app G-code keyboard, history and quick read-only commands.
  import ArrowDownToLine from '@lucide/svelte/icons/arrow-down-to-line';
  import History from '@lucide/svelte/icons/history';
  import Keyboard from '@lucide/svelte/icons/keyboard';
  import KeyboardOff from '@lucide/svelte/icons/keyboard-off';
  import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
  import { tick } from 'svelte';
  import { editText, type KeyboardLocale } from '../../lib/core/keyboard';
  import { lineKind, visibleLines } from '../../lib/core/terminal';
  import { i18n, t } from '../../lib/i18n/index.svelte';
  import { printer, settings, terminal } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import { dialogs } from '../../lib/ui/dialogs.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import Modal from '../../lib/ui/Modal.svelte';
  import OnScreenKeyboard from '../../lib/ui/OnScreenKeyboard.svelte';
  import { pressable } from '../../lib/ui/press';
  import { sendCommand } from './actions';
  import { view } from './view.svelte';

  /** Lines kept in the DOM (the store holds up to 1000). */
  const RENDER_LIMIT = 300;
  const QUICK = [
    { code: 'M114', key: 'position' },
    { code: 'M105', key: 'temperatures' },
    { code: 'M119', key: 'endstops' },
    { code: 'M503', key: 'settings' },
    { code: 'M115', key: 'firmware' },
  ] as const;

  let box = $state<HTMLDivElement>();
  let follow = $state(true);
  let historyOpen = $state(false);

  const filters = $derived(settings.value.terminal.filters);
  const source = $derived(view.pausedAt === null ? terminal.lines : terminal.lines.filter((l) => l.id <= view.pausedAt!));
  const shown = $derived(visibleLines(source, filters, RENDER_LIMIT));
  const newWhilePaused = $derived(
    view.pausedAt === null ? 0 : visibleLines(terminal.lines.filter((l) => l.id > view.pausedAt!), filters, 999).length,
  );
  const locale = $derived<KeyboardLocale>(i18n.locale === 'it' ? 'it' : 'en');

  // Stay at the bottom while following; a scroll up stops following until the user comes back.
  $effect(() => {
    void shown;
    if (!follow) return;
    void tick().then(() => box?.scrollTo({ top: box.scrollHeight }));
  });

  function onscroll() {
    if (!box) return;
    follow = box.scrollHeight - box.scrollTop - box.clientHeight < 32;
  }

  function jumpToEnd() {
    follow = true;
    box?.scrollTo({ top: box.scrollHeight });
  }

  async function send() {
    if (await sendCommand(view.draft)) {
      view.draft = '';
      jumpToEnd();
    }
  }

  function onkey(key: 'backspace' | 'enter' | 'space') {
    if (key === 'enter') void send();
    else view.draft = editText(view.draft, { key });
  }

  function keydown(event: KeyboardEvent) {
    // Physical keyboard in dev, only while the in-app one is open and no dialog is on top.
    if (!view.keyboard || dialogs.stack.length || historyOpen) return;
    if (event.key === 'Backspace') onkey('backspace');
    else if (event.key === 'Enter') onkey('enter');
    else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) view.draft = editText(view.draft, { char: event.key });
    else return;
    event.preventDefault();
  }

  function pickHistory(command: string) {
    view.draft = command;
    historyOpen = false;
    view.keyboard = true;
  }

  const gutter: Record<string, string> = { send: '›', recv: '', info: '•', error: '!', warning: '!' };
  const display = (text: string) => text.replace(/^(?:Send|Recv):\s?/, '');
</script>

<svelte:window onkeydown={keydown} />

<div class="console" class:with-keyboard={view.keyboard}>
  <div class="log-wrap">
    <div class="log" bind:this={box} {onscroll} data-testid="terminal-log" aria-live="off">
      {#each shown as line (line.id)}
        {@const kind = lineKind(line.text)}
        <div class="line {kind}"><span class="gutter" aria-hidden="true">{gutter[kind]}</span>{display(line.text)}</div>
      {:else}
        <p class="empty">{t('terminal.empty')}</p>
      {/each}
    </div>
    {#if view.pausedAt !== null}
      <div class="banner paused" data-testid="terminal-paused">
        {t('terminal.pausedBanner', { count: newWhilePaused })}
        <Button variant="ghost" onclick={() => (view.pausedAt = null)}>{t('terminal.resume')}</Button>
      </div>
    {:else if !follow}
      <Button class="jump" icon={ArrowDownToLine} onclick={jumpToEnd} data-testid="terminal-jump">{t('terminal.jump')}</Button>
    {/if}
  </div>

  <div class="input-row">
    <IconButton icon={History} label={t('terminal.history')} disabled={!terminal.history.length} onclick={() => (historyOpen = true)} data-testid="terminal-history" />
    <button
      type="button"
      class="field"
      class:active={view.keyboard}
      onclick={() => (view.keyboard = !view.keyboard)}
      data-testid="terminal-input"
      {@attach pressable}
    >
      <span class="value" class:placeholder={!view.draft}>{view.draft || t('terminal.placeholder')}</span>
      {#if view.keyboard}<span class="caret"></span>{/if}
    </button>
    <IconButton
      icon={view.keyboard ? KeyboardOff : Keyboard}
      label={t(view.keyboard ? 'terminal.hideKeyboard' : 'terminal.showKeyboard')}
      variant="ghost"
      onclick={() => (view.keyboard = !view.keyboard)}
      data-testid="terminal-keyboard-toggle"
    />
    <Button variant="primary" icon={SendHorizontal} disabled={!view.draft.trim() || !printer.operational} onclick={send} data-testid="terminal-send">
      {t('terminal.send')}
    </Button>
  </div>

  {#if view.keyboard}
    <OnScreenKeyboard layer="gcode" {locale} onchar={(char) => (view.draft = editText(view.draft, { char }))} {onkey} />
  {:else}
    <div class="quick" role="group" aria-label={t('terminal.quick')}>
      {#each QUICK as quick (quick.code)}
        <Button disabled={!printer.operational} onclick={() => sendCommand(quick.code)} data-testid="quick-{quick.code}">
          <span class="code">{quick.code}</span>
          <span class="what">{t(`terminal.quick.${quick.key}`)}</span>
        </Button>
      {/each}
    </div>
  {/if}
</div>

{#if historyOpen}
  <Modal title={t('terminal.history')} icon={History} tone="accent" onclose={() => (historyOpen = false)} width={560} testid="terminal-history-list">
    <ul class="history">
      {#each terminal.history as command (command)}
        <li><Button block onclick={() => pickHistory(command)}><span class="code">{command}</span></Button></li>
      {/each}
    </ul>
  </Modal>
{/if}

<style>
  .console {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--sp-2);
    min-height: 0;
  }
  .log-wrap {
    position: relative;
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }
  .log {
    flex: 1;
    min-height: 0;
    padding: var(--sp-2) var(--sp-3);
    overflow-y: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--bg);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    line-height: 1.45;
  }
  .line {
    display: flex;
    gap: var(--sp-2);
    color: var(--text);
    white-space: pre-wrap;
    word-break: break-all;
  }
  .gutter {
    flex: none;
    width: 1ch;
    color: var(--text-faint);
  }
  .send {
    color: var(--accent-strong);
  }
  .send .gutter {
    color: var(--accent);
  }
  .info {
    color: var(--text-faint);
  }
  .warning,
  .warning .gutter {
    color: var(--paused);
  }
  .error,
  .error .gutter {
    color: var(--error);
  }
  .empty {
    margin: var(--sp-4) 0;
    color: var(--text-faint);
    font-family: var(--font);
    text-align: center;
  }
  .banner {
    position: absolute;
    right: var(--sp-2);
    bottom: var(--sp-2);
    left: var(--sp-2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--touch);
    padding: 0 var(--sp-2) 0 var(--sp-4);
    border-radius: var(--r-md);
    /* Opaque (the tint over the log background): no backdrop blur, costly on the Pi's GPU. */
    background: linear-gradient(var(--paused-soft), var(--paused-soft)), var(--bg);
    color: var(--paused);
  }
  .log-wrap :global(.jump) {
    position: absolute;
    right: var(--sp-3);
    bottom: var(--sp-3);
    box-shadow: var(--shadow-1);
  }
  .input-row {
    display: flex;
    gap: var(--sp-2);
  }
  .field {
    display: flex;
    flex: 1;
    align-items: center;
    min-width: 0;
    min-height: var(--touch);
    padding: 0 var(--sp-4);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--bg);
    text-align: left;
  }
  .field.active {
    border: 2px solid var(--accent);
  }
  .value {
    overflow: hidden;
    color: var(--text);
    font-family: var(--font-mono);
    font-size: var(--fs-lg);
    text-overflow: ellipsis;
    white-space: pre;
  }
  .placeholder {
    color: var(--text-faint);
    font-family: var(--font);
  }
  .caret {
    flex: none;
    width: 3px;
    height: 1.2em;
    margin-left: 2px;
    background: var(--accent);
    animation: blink 1s steps(1) infinite;
  }
  @keyframes blink {
    50% {
      opacity: 0;
    }
  }
  .quick {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: var(--sp-2);
  }
  .quick :global(.btn) {
    min-height: 60px;
  }
  .quick :global(.label) {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }
  .code {
    font-family: var(--font-mono);
    font-weight: var(--fw-bold);
  }
  .what {
    color: var(--text-dim);
    font-size: var(--fs-xs);
  }
  .with-keyboard :global(.keyboard) {
    margin: 0 calc(-1 * var(--sp-3)) calc(-1 * var(--sp-3));
    border-radius: 0;
  }
  .history {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    max-height: 380px;
    margin: 0;
    padding: 0;
    overflow-y: auto;
    list-style: none;
  }
  .history :global(.btn) {
    justify-content: flex-start;
  }
</style>
