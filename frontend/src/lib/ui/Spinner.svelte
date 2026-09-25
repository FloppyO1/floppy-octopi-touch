<script lang="ts">
  interface Props {
    size?: number;
    label?: string;
  }

  let { size = 40, label }: Props = $props();
</script>

<span class="spinner" role={label ? 'status' : undefined} aria-label={label} style:width="{size}px" style:height="{size}px">
  <svg viewBox="0 0 40 40" aria-hidden="true">
    <circle class="track" cx="20" cy="20" r="16" />
    <circle class="head" cx="20" cy="20" r="16" />
  </svg>
</span>

<style>
  .spinner {
    display: inline-block;
    flex: none;
  }
  svg {
    width: 100%;
    height: 100%;
    animation: spin 1s linear infinite;
  }
  circle {
    fill: none;
    stroke-width: 4;
    stroke-linecap: round;
  }
  .track {
    stroke: var(--surface-3);
  }
  .head {
    stroke: var(--accent);
    stroke-dasharray: 30 100;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
