<script lang="ts">
  // Temporary System screen (session 3): language, accent colour and version until the real screen (session 8).
  import Info from '@lucide/svelte/icons/info';
  import Languages from '@lucide/svelte/icons/languages';
  import MonitorPlay from '@lucide/svelte/icons/monitor-play';
  import Palette from '@lucide/svelte/icons/palette';
  import { ACCENTS, LANGUAGES } from '../lib/core/settings';
  import { i18n, t } from '../lib/i18n/index.svelte';
  import { connection, settings } from '../lib/stores';
  import Button from '../lib/ui/Button.svelte';
  import Card from '../lib/ui/Card.svelte';
  import Toggle from '../lib/ui/Toggle.svelte';

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

  <!-- Temporary switch (session 5); the full screensaver settings come with session 8. -->
  <Card title={t('system.screensaver')} icon={MonitorPlay}>
    <div data-testid="saver-thumbnail-toggle">
      <Toggle
        label={t('system.saverThumbnail')}
        hint={t('system.saverThumbnailHint')}
        checked={settings.value.screensaver.showThumbnail}
        onchange={(on) => settings.update((s) => (s.screensaver.showThumbnail = on))}
      />
    </div>
  </Card>

  <Card title={t('system.accent')} icon={Palette} class="wide">
    <div class="row" role="group" aria-label={t('system.accent')}>
      {#each ACCENTS as accent (accent)}
        <Button
          size="lg"
          selected={settings.value.accent === accent}
          onclick={() => settings.setAccent(accent)}
          data-testid="accent-{accent}"
        >
          <span class="swatch" data-accent={accent}></span>
          {t(`accent.${accent}`)}
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
    grid-auto-flow: row dense;
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
  .system :global(.wide) {
    grid-column: 1 / -1;
  }
  .swatch {
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
  }
  .row :global(.label) {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .note {
    margin: 0;
    color: var(--text-faint);
    font-size: var(--fs-sm);
  }
</style>
