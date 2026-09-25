<script lang="ts">
  import ArrowBigUp from '@lucide/svelte/icons/arrow-big-up';
  import ArrowBigUpDash from '@lucide/svelte/icons/arrow-big-up-dash';
  import CornerDownLeft from '@lucide/svelte/icons/corner-down-left';
  import Delete from '@lucide/svelte/icons/delete';
  import { onDestroy } from 'svelte';
  import {
    keyboardRows,
    keyChar,
    keyWidth,
    type KeyboardLayer,
    type KeyboardLocale,
    type KeyDef,
  } from '../core/keyboard';
  import { t } from '../i18n/index.svelte';
  import { pressable } from './press';

  interface Props {
    /** Starting layer: `gcode` for the terminal and macros. */
    layer?: KeyboardLayer;
    locale?: KeyboardLocale;
    /** Enter inserts a new line instead of submitting. */
    multiline?: boolean;
    onchar: (char: string) => void;
    onkey: (key: 'backspace' | 'enter' | 'space') => void;
  }

  let { layer: initialLayer = 'letters', locale: initialLocale = 'en', multiline = false, onchar, onkey }: Props =
    $props();

  // svelte-ignore state_referenced_locally
  let layer = $state<KeyboardLayer>(initialLayer);
  // svelte-ignore state_referenced_locally
  let locale = $state<KeyboardLocale>(initialLocale);
  /** 'off' | 'once' (next character only) | 'lock' (double tap). */
  let shift = $state<'off' | 'once' | 'lock'>('off');
  let lastShiftTap = 0;

  const rows = $derived(keyboardRows(layer, locale));
  const shifted = $derived(shift !== 'off');

  const REPEAT_DELAY_MS = 450;
  const REPEAT_MS = 70;
  let repeatTimer: ReturnType<typeof setTimeout> | null = null;
  const stopRepeat = () => {
    if (repeatTimer) clearTimeout(repeatTimer);
    repeatTimer = null;
  };
  onDestroy(stopRepeat);

  function charKey(key: KeyDef & { kind: 'char' }) {
    onchar(keyChar(key, shifted));
    if (shift === 'once') shift = 'off';
  }

  function specialKey(key: KeyDef & { kind: 'special' }) {
    switch (key.key) {
      case 'shift': {
        const now = Date.now();
        if (shift === 'off') shift = now - lastShiftTap < 350 ? 'lock' : 'once';
        else if (shift === 'once' && now - lastShiftTap < 350) shift = 'lock';
        else shift = 'off';
        lastShiftTap = now;
        break;
      }
      case 'symbols':
        layer = 'symbols';
        break;
      case 'letters':
        layer = 'letters';
        break;
      case 'gcode':
        layer = 'gcode';
        break;
      case 'lang':
        locale = locale === 'en' ? 'it' : 'en';
        break;
      case 'space':
      case 'enter':
        onkey(key.key);
        break;
      case 'backspace':
        break; // handled on pointerdown (auto-repeat)
    }
  }

  function backspaceDown(event: PointerEvent) {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    stopRepeat();
    onkey('backspace');
    const repeat = () => {
      onkey('backspace');
      repeatTimer = setTimeout(repeat, REPEAT_MS);
    };
    repeatTimer = setTimeout(repeat, REPEAT_DELAY_MS);
  }

  const specialLabel: Record<string, () => string> = {
    symbols: () => '?123',
    letters: () => 'ABC',
    gcode: () => 'G-code',
    lang: () => locale.toUpperCase(),
    space: () => t('keyboard.space'),
  };
</script>

<div class="keyboard" data-testid="keyboard" data-layer={layer}>
  {#each rows as row, r (r)}
    <div class="row">
      {#each row as key, k (k)}
        {#if key.kind === 'char'}
          <button
            type="button"
            class="key"
            class:mono={layer === 'gcode'}
            style:flex-grow={keyWidth(key)}
            onclick={() => charKey(key)}
            {@attach pressable}
          >
            {keyChar(key, shifted)}
          </button>
        {:else if key.key === 'backspace'}
          <button
            type="button"
            class="key fn"
            style:flex-grow={keyWidth(key)}
            aria-label={t('keyboard.backspace')}
            onpointerdown={backspaceDown}
            onpointerup={stopRepeat}
            onpointercancel={stopRepeat}
            onlostpointercapture={stopRepeat}
            {@attach pressable}
          >
            <Delete size={26} aria-hidden="true" />
          </button>
        {:else if key.key === 'shift'}
          <button
            type="button"
            class="key fn"
            class:active={shifted}
            style:flex-grow={keyWidth(key)}
            aria-label={t('keyboard.shift')}
            aria-pressed={shifted}
            onclick={() => specialKey(key)}
            {@attach pressable}
          >
            {#if shift === 'lock'}
              <ArrowBigUpDash size={26} aria-hidden="true" />
            {:else}
              <ArrowBigUp size={26} aria-hidden="true" />
            {/if}
          </button>
        {:else if key.key === 'enter'}
          <button
            type="button"
            class="key fn enter"
            style:flex-grow={keyWidth(key)}
            aria-label={multiline ? t('keyboard.newline') : t('keyboard.enter')}
            onclick={() => specialKey(key)}
            {@attach pressable}
          >
            <CornerDownLeft size={26} aria-hidden="true" />
          </button>
        {:else}
          <button
            type="button"
            class="key fn"
            class:space={key.key === 'space'}
            style:flex-grow={keyWidth(key)}
            onclick={() => specialKey(key)}
            {@attach pressable}
          >
            {specialLabel[key.key]?.() ?? key.key}
          </button>
        {/if}
      {/each}
    </div>
  {/each}
</div>

<style>
  .keyboard {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: var(--sp-2);
    background: var(--surface);
    border-top: 1px solid var(--border);
  }
  .row {
    display: flex;
    gap: 6px;
  }
  .key {
    flex: 1 1 0;
    min-width: 0;
    height: 56px;
    padding: 0;
    border: 0;
    border-radius: var(--r-sm);
    background: var(--surface-3);
    font-size: var(--fs-xl);
    font-weight: var(--fw-medium);
    display: grid;
    place-items: center;
    transition: transform var(--dur-fast) var(--ease);
  }
  .mono {
    font-family: var(--font-mono);
    font-weight: var(--fw-bold);
  }
  .fn {
    background: var(--surface-2);
    color: var(--text-dim);
    font-size: var(--fs-md);
  }
  .fn.active {
    background: var(--accent-soft);
    color: var(--accent-strong);
  }
  .enter {
    background: var(--accent);
    color: var(--on-accent);
  }
  .space {
    color: var(--text-faint);
  }
  .key:global([data-pressed]) {
    transform: scale(0.94);
    filter: brightness(1.35);
  }
</style>
