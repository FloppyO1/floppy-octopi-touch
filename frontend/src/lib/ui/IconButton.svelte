<script lang="ts">
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Button from './Button.svelte';
  import type { ButtonSize, ButtonVariant, IconComponent } from './types';

  interface Props extends HTMLButtonAttributes {
    icon: IconComponent;
    /** Accessible name (translated); icon-only buttons have no visible text. */
    label: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    selected?: boolean;
  }

  let { icon, label, variant = 'secondary', size = 'md', ...rest }: Props = $props();
</script>

<Button {icon} {variant} {size} aria-label={label} {...rest} />
