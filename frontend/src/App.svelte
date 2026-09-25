<script lang="ts">
  import { onDestroy, onMount, type Component } from 'svelte';
  import { t } from './lib/i18n/index.svelte';
  import * as stores from './lib/stores';
  import DialogHost from './lib/ui/DialogHost.svelte';
  import PromptDialog from './lib/ui/PromptDialog.svelte';
  import { toast } from './lib/ui/toast.svelte';
  import ToastHost from './lib/ui/ToastHost.svelte';
  import ConnectionOverlay from './shell/ConnectionOverlay.svelte';
  import Shell from './shell/Shell.svelte';

  const { prompt } = stores;

  // Dev-only pages; the dynamic imports are dropped from the production build.
  const DEV_PAGES: Record<string, () => Promise<{ default: Component }>> = import.meta.env.DEV
    ? {
        '/ui-gallery': () => import('./screens/dev/Gallery.svelte'),
        '/debug': () => import('./screens/dev/Debug.svelte'),
      }
    : {};
  const devRoute = location.pathname.replace(/\/+$/, '');
  const isDevPage = devRoute in DEV_PAGES;
  let DevPage = $state<Component | null>(null);
  if (isDevPage) void DEV_PAGES[devRoute]().then((m) => (DevPage = m.default));

  if (import.meta.env.DEV) {
    // Lets Playwright and the browser console inspect the stores.
    (window as unknown as { __fot: unknown }).__fot = { ...stores, toast };
  }

  let offNotification: (() => void) | undefined;
  onMount(() => {
    stores.startDataLayer();
    stores.clock.start();
    offNotification = stores.events.on('host:notification', (event) => {
      const message = String(event.payload?.message ?? '');
      if (message) toast.show(t('prompt.notification', { message }));
    });
  });
  onDestroy(() => {
    offNotification?.();
    stores.clock.stop();
    stores.stopDataLayer();
  });
</script>

{#if isDevPage}
  {#if DevPage}<DevPage />{/if}
{:else}
  <Shell />
  <ConnectionOverlay />
  {#if prompt.enabled && prompt.active}
    {#key prompt.active}
      <PromptDialog prompt={prompt.active} onanswer={(choice) => prompt.answer(choice)} ondismiss={() => prompt.dismiss()} />
    {/key}
  {/if}
{/if}
<DialogHost />
<ToastHost />
