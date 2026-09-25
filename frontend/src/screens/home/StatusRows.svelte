<script lang="ts">
  import Box from '@lucide/svelte/icons/box';
  import Link2 from '@lucide/svelte/icons/link-2';
  import Printer from '@lucide/svelte/icons/printer';
  import { phaseTone } from '../../lib/core/printerState';
  import { t } from '../../lib/i18n/index.svelte';
  import { connection, printer, server } from '../../lib/stores';
  import InfoRow from '../../lib/ui/InfoRow.svelte';

  const port = $derived(connection.info?.current.port);
</script>

<InfoRow
  icon={Printer}
  label={t('home.state')}
  value={printer.state?.text ?? '—'}
  tone={phaseTone(printer.phase)}
  testid="home-state"
/>
<InfoRow icon={Box} label={t('home.profile')} value={server.profile?.name ?? '—'} tone="accent" />
<InfoRow
  icon={Link2}
  label={t('home.connection')}
  value={port ? `${port} @ ${connection.info?.current.baudrate ?? '—'}` : '—'}
  tone={printer.operational ? 'ok' : 'neutral'}
/>
