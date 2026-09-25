<script lang="ts">
  // Language, accent colour, clock, end-of-print beep and the reset of every setting.
  import Bell from '@lucide/svelte/icons/bell';
  import Languages from '@lucide/svelte/icons/languages';
  import Palette from '@lucide/svelte/icons/palette';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import { ACCENTS, LANGUAGES } from '../../../lib/core/settings';
  import { i18n, t } from '../../../lib/i18n/index.svelte';
  import { settings } from '../../../lib/stores';
  import Button from '../../../lib/ui/Button.svelte';
  import Card from '../../../lib/ui/Card.svelte';
  import InputField from '../../../lib/ui/InputField.svelte';
  import Toggle from '../../../lib/ui/Toggle.svelte';
  import { resetSettings } from '../actions';

  // Each language in its own name: whoever cannot read the current one still finds theirs.
  const LANGUAGE_NAMES: Record<string, string> = { en: 'English', it: 'Italiano' };
  const s = $derived(settings.value);
</script>

<Card title={t('language')} icon={Languages}>
  <div class="row" role="group" aria-label={t('language')}>
    {#each LANGUAGES as locale (locale)}
      <Button size="lg" selected={i18n.locale === locale} onclick={() => settings.setLanguage(locale)} data-testid="lang-{locale}">
        {LANGUAGE_NAMES[locale]}
      </Button>
    {/each}
  </div>
  <div data-testid="clock24h">
    <Toggle
      label={t('settings.clock24h')}
      hint={t('settings.clock24hHint')}
      checked={s.clock24h}
      onchange={(on) => settings.update((v) => (v.clock24h = on))}
    />
  </div>
</Card>

<Card title={t('system.accent')} icon={Palette}>
  <div class="row" role="group" aria-label={t('system.accent')}>
    {#each ACCENTS as accent (accent)}
      <Button size="lg" selected={s.accent === accent} onclick={() => settings.setAccent(accent)} data-testid="accent-{accent}">
        <span class="swatch" data-accent={accent}></span>
        {t(`accent.${accent}`)}
      </Button>
    {/each}
  </div>
</Card>

<Card title={t('settings.printDone')} icon={Bell}>
  <div data-testid="beep-toggle">
    <Toggle
      label={t('settings.beep')}
      hint={t('settings.beepHint')}
      checked={s.printDone.beep}
      onchange={(on) => settings.update((v) => (v.printDone.beep = on))}
    />
  </div>
  <InputField
    type="gcode"
    label={t('settings.beepGcode')}
    value={s.printDone.beepGcode}
    placeholder="M300 S880 P400"
    disabled={!s.printDone.beep}
    maxLength={200}
    onchange={(gcode) => settings.update((v) => (v.printDone.beepGcode = gcode.trim() || 'M300 S880 P400'))}
    testid="beep-gcode"
  />
</Card>

<Card title={t('settings.resetCard')} icon={RotateCcw}>
  <p class="hint">{t('settings.resetHint')}</p>
  <div>
    <Button variant="danger" icon={RotateCcw} onclick={resetSettings} data-testid="settings-reset">{t('settings.reset')}</Button>
  </div>
</Card>

<style>
  .row {
    display: flex;
    gap: var(--sp-3);
  }
  .row :global(.btn) {
    flex: 1;
  }
  .row :global(.label) {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .swatch {
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
  }
  .hint {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--fs-md);
  }
</style>
