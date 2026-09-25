<script lang="ts">
  import { connection, nav, printer } from '../lib/stores';
  import PrinterOverlay from './PrinterOverlay.svelte';
  import { SCREENS } from './screens';
  import Sidebar from './Sidebar.svelte';
  import StatusBar from './StatusBar.svelte';

  const screen = $derived(SCREENS.find((s) => s.id === nav.current) ?? SCREENS[0]);
  const printerDown = $derived(
    connection.live && ['unknown', 'disconnected', 'error', 'connecting'].includes(printer.phase),
  );
</script>

<div class="shell">
  <Sidebar />
  <div class="column">
    <StatusBar />
    <main data-testid="screen-{screen.id}">
      {#key screen.id}
        <screen.component />
      {/key}
      {#if screen.needsPrinter && printerDown}
        <PrinterOverlay />
      {/if}
    </main>
  </div>
</div>

<style>
  .shell {
    display: flex;
    width: 1024px;
    height: 600px;
    overflow: hidden;
    background: var(--bg);
  }
  .column {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
  }
  main {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
</style>
