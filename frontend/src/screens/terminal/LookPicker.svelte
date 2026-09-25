<script lang="ts">
  // Icon and colour choice of a macro or a custom action button.
  import { MACRO_COLORS, MACRO_ICONS } from '../../lib/core/macros';
  import { t } from '../../lib/i18n/index.svelte';
  import Button from '../../lib/ui/Button.svelte';
  import { macroColor, macroIcon } from './macroLook';

  interface Props {
    icon: string;
    color: string;
    /** Buttons get `data-testid="<testid>-icon-<name>"` / `<testid>-color-<name>`. */
    testid: string;
  }

  let { icon = $bindable(), color = $bindable(), testid }: Props = $props();
</script>

<div class="look">
  <span class="label">{t('macros.icon')}</span>
  <div class="icons" role="radiogroup" aria-label={t('macros.icon')}>
    {#each MACRO_ICONS as name (name)}
      {@const Icon = macroIcon(name)}
      <Button
        role="radio"
        aria-checked={icon === name}
        aria-label={t(`macros.icons.${name}`)}
        selected={icon === name}
        onclick={() => (icon = name)}
        data-testid="{testid}-icon-{name}"
      >
        <Icon size={24} aria-hidden="true" />
      </Button>
    {/each}
  </div>
  <span class="label">{t('macros.color')}</span>
  <div class="colors" role="radiogroup" aria-label={t('macros.color')}>
    {#each MACRO_COLORS as name (name)}
      <button
        type="button"
        role="radio"
        class="swatch"
        class:selected={color === name}
        style:--swatch={macroColor(name)}
        aria-checked={color === name}
        aria-label={t(`macros.colors.${name}`)}
        onclick={() => (color = name)}
        data-testid="{testid}-color-{name}"
      ></button>
    {/each}
  </div>
</div>

<style>
  .look {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    min-width: 0;
  }
  .label {
    font-weight: var(--fw-medium);
  }
  .icons,
  .colors {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--sp-2);
  }
  .colors {
    grid-template-columns: repeat(3, 1fr);
  }
  .icons :global(.btn) {
    padding: 0;
  }
  .swatch {
    height: var(--touch);
    border: 3px solid var(--surface);
    border-radius: var(--r-md);
    background: var(--swatch) padding-box;
    box-shadow: 0 0 0 1px var(--border);
  }
  .swatch.selected {
    border-color: var(--text);
  }
</style>
