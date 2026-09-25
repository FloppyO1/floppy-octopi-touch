<script lang="ts">
  // OctoPrint API key (replaced on the in-app keyboard, checked by the agent) and the webcam URL.
  import KeyRound from '@lucide/svelte/icons/key-round';
  import Video from '@lucide/svelte/icons/video';
  import { getApiKeyState } from '../../../lib/api/agent';
  import type { ApiKeyState } from '../../../lib/api/types';
  import { t } from '../../../lib/i18n/index.svelte';
  import { connection, server, settings } from '../../../lib/stores';
  import Button from '../../../lib/ui/Button.svelte';
  import Card from '../../../lib/ui/Card.svelte';
  import InputField from '../../../lib/ui/InputField.svelte';
  import { changeApiKey } from '../actions';

  let key = $state<ApiKeyState | null>(null);
  void getApiKeyState().then(
    (state) => (key = state),
    () => (key = null),
  );

  const keyText = $derived.by(() => {
    if (!key) return '—';
    if (!key.configured) return t('apikey.none');
    return t('apikey.configured', { hint: key.hint ?? '' });
  });
  const webcamSource = $derived(settings.value.webcam.url ? t('settings.webcamManual') : server.webcam ? t('settings.webcamOctoPrint') : t('webcam.none'));
</script>

<Card title={t('apikey.title')} icon={KeyRound}>
  <div class="key">
    <span class="value" data-testid="apikey-state">{keyText}</span>
    <span class="status" class:ok={connection.authorized}>
      {connection.authorized ? t('apikey.accepted') : t('status.unauthorized')}
    </span>
  </div>
  <p class="hint">{t('apikey.hint')}</p>
  {#if key && !key.persistent}
    <p class="warn">{t('apikey.fromEnv')}</p>
  {/if}
  <div>
    <Button variant="primary" icon={KeyRound} onclick={changeApiKey} data-testid="apikey-change">{t('apikey.change')}</Button>
  </div>
</Card>

<Card title={t('webcam.title')} icon={Video}>
  <InputField
    label={t('settings.webcamUrl')}
    value={settings.value.webcam.url}
    placeholder="/webcam/?action=stream"
    maxLength={300}
    onchange={(url: string) => settings.update((s) => (s.webcam.url = url.trim()))}
    testid="webcam-url"
  />
  <p class="hint">{t('settings.webcamHint')} <strong>{webcamSource}</strong></p>
</Card>

<style>
  .key {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
  }
  .value {
    color: var(--text);
    font-size: var(--fs-lg);
    font-weight: var(--fw-bold);
  }
  .status {
    color: var(--error);
    font-size: var(--fs-sm);
    font-weight: var(--fw-medium);
  }
  .status.ok {
    color: var(--ok);
  }
  .hint {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .hint strong {
    color: var(--text);
  }
  .warn {
    margin: 0;
    color: var(--paused);
    font-size: var(--fs-sm);
  }
</style>
