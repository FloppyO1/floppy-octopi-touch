<script lang="ts">
  // About: versions, licence, repository and the bundled third-party software.
  import Info from '@lucide/svelte/icons/info';
  import Scale from '@lucide/svelte/icons/scale';
  import { t } from '../../lib/i18n/index.svelte';
  import { capabilities, connection, system } from '../../lib/stores';
  import Card from '../../lib/ui/Card.svelte';

  const REPO_URL = 'github.com/FloppyO1/floppy-octopi-touch';
  const CREDITS = [
    ['Svelte', 'MIT'],
    ['Lucide icons', 'ISC'],
    ['Inter font', 'OFL 1.1'],
    ['uPlot', 'MIT'],
    ['aiohttp', 'Apache 2.0'],
  ] as const;
</script>

<div class="about">
  <Card title={t('system.about')} icon={Info}>
    <div class="brand">
      <span class="name">FloppyOctoTouch</span>
      <span class="version tabular" data-testid="about-version">v{__APP_VERSION__}</span>
    </div>
    <p class="tagline">{t('about.tagline')}</p>
    <dl>
      <dt>{t('status.octoprint')}</dt>
      <dd class="tabular">{connection.server?.display_version ?? '—'}</dd>
      <dt>{t('status.agent')}</dt>
      <dd class="tabular">{connection.agent?.version ?? '—'}</dd>
      <dt>{t('about.firmware')}</dt>
      <dd>{capabilities.report.firmwareName ?? '—'}</dd>
      <dt>{t('system.hostname')}</dt>
      <dd>{system.info?.hostname ?? '—'}</dd>
      <dt>{t('about.repository')}</dt>
      <!-- Too long for one line: may wrap after a slash, never cut. -->
      <dd class="wrap">
        {#each REPO_URL.split('/') as part, i (i)}{#if i}/<wbr />{/if}<span>{part}</span>{/each}
      </dd>
    </dl>
  </Card>

  <Card title={t('about.license')} icon={Scale}>
    <p class="license">{t('about.licenseText')}</p>
    <p class="dim">{t('about.credits')}</p>
    <ul>
      {#each CREDITS as [name, license] (name)}
        <li><span>{name}</span><span class="dim">{license}</span></li>
      {/each}
    </ul>
  </Card>
</div>

<style>
  .about {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-3);
    align-items: start;
  }
  .brand {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
  }
  .name {
    color: var(--accent);
    font-size: var(--fs-2xl);
    font-weight: var(--fw-bold);
  }
  .version {
    color: var(--text);
    font-size: var(--fs-xl);
    font-weight: var(--fw-bold);
  }
  .tagline,
  .license {
    margin: 0;
    color: var(--text);
    font-size: var(--fs-md);
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--sp-2) var(--sp-4);
    margin: 0;
  }
  dt,
  .dim {
    margin: 0;
    color: var(--text-dim);
  }
  dd {
    margin: 0;
    overflow: hidden;
    font-weight: var(--fw-medium);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  dd.wrap span {
    white-space: nowrap;
  }
  dd.wrap {
    white-space: normal;
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: var(--sp-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    justify-content: space-between;
    font-size: var(--fs-md);
  }
</style>
