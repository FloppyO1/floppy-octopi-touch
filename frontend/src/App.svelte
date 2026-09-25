<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import * as stores from './lib/stores';
  import Debug from './screens/Debug.svelte';

  // Dev only: lets Playwright and the browser console inspect the stores.
  if (import.meta.env.DEV) (window as unknown as { __fot: typeof stores }).__fot = stores;

  onMount(stores.startDataLayer);
  onDestroy(stores.stopDataLayer);
</script>

<Debug />
