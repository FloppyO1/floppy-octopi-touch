<script lang="ts">
  // Temporary System screen (session 3): language and version until the real screen (session 8).
  import Info from '@lucide/svelte/icons/info';
  import Languages from '@lucide/svelte/icons/languages';
  import { LANGUAGES } from '../lib/core/settings';
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { connection, settings } from '../lib/stores';
  import Button from '../lib/ui/Button.svelte';
  import Card from '../lib/ui/Card.svelte';

  const LANGUAGE_NAMES: Record<string, string> = { en: 'English', it: 'Italiano' };
</script>

<div class="system">
  <Card title={t('language')} icon={Languages}>
    <div class="row" role="group" aria-label={t('language')}>
      {#each LANGUAGES as locale (locale)}
        <Button
          size="lg"
          selected={i18n.locale === locale}
          onclick={() => settings.setLanguage(locale)}
          data-testid="lang-{locale}"
        >
          {LANGUAGE_NAMES[locale]}
        </Button>
      {/each}
    </div>
  </Card>

  <Card title={t('system.about')} icon={Info}>
    <dl>
      <dt>FloppyOctoTouch</dt>
      <dd class="tabular">v{__APP_VERSION__}</dd>
      <dt>{t('status.octoprint')}</dt>
      <dd class="tabular">{connection.server?.display_version ?? '—'}</dd>
      <dt>{t('status.agent')}</dt>
      <dd class="tabular">{connection.agent?.version ?? '—'}</dd>
    </dl>
    <p class="note">{t('system.soon')}</p>
  </Card>
</div>

<style>
  .system {
    display: grid;
    grid-template-columns: 1fr 1fr;
    align-content: start;
    gap: var(--sp-3);
    height: 100%;
    padding: var(--sp-3);
  }
  .row {
    display: flex;
    gap: var(--sp-3);
  }
  .row :global(.btn) {
    flex: 1;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--sp-2) var(--sp-4);
    margin: 0;
  }
  dt {
    color: var(--text-dim);
  }
  dd {
    margin: 0;
    font-weight: var(--fw-medium);
  }
  .note {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--fs-sm);
  }
</style>
