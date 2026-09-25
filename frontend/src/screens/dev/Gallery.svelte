<script lang="ts">
  // Dev-only page (/ui-gallery): every design-system component with demo data. Section titles are
  // component names (not localised); texts of the components themselves go through i18n.
  import Box from '@lucide/svelte/icons/box';
  import Cpu from '@lucide/svelte/icons/cpu';
  import Fan from '@lucide/svelte/icons/fan';
  import Flame from '@lucide/svelte/icons/flame';
  import Heater from '@lucide/svelte/icons/heater';
  import House from '@lucide/svelte/icons/house';
  import Layers from '@lucide/svelte/icons/layers';
  import Link2 from '@lucide/svelte/icons/link-2';
  import Pause from '@lucide/svelte/icons/pause';
  import Play from '@lucide/svelte/icons/play';
  import Printer from '@lucide/svelte/icons/printer';
  import Square from '@lucide/svelte/icons/square';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { onDestroy, onMount } from 'svelte';
  import { heaterTone } from '../../lib/core/gauge';
  import type { HostPrompt } from '../../lib/core/hostActions';
  import { i18n, t } from '../../lib/i18n/index.svelte';
  import { settings } from '../../lib/stores';
  import Button from '../../lib/ui/Button.svelte';
  import Card from '../../lib/ui/Card.svelte';
  import { dialogs } from '../../lib/ui/dialogs.svelte';
  import IconButton from '../../lib/ui/IconButton.svelte';
  import InfoRow from '../../lib/ui/InfoRow.svelte';
  import InputField from '../../lib/ui/InputField.svelte';
  import Modal from '../../lib/ui/Modal.svelte';
  import OnScreenKeyboard from '../../lib/ui/OnScreenKeyboard.svelte';
  import PromptDialog from '../../lib/ui/PromptDialog.svelte';
  import RingGauge from '../../lib/ui/RingGauge.svelte';
  import Select from '../../lib/ui/Select.svelte';
  import Slider from '../../lib/ui/Slider.svelte';
  import Spinner from '../../lib/ui/Spinner.svelte';
  import Stepper from '../../lib/ui/Stepper.svelte';
  import { ACCENTS, applyAccent, DEFAULT_ACCENT, isAccent, type Accent } from '../../lib/ui/theme';
  import { toast } from '../../lib/ui/toast.svelte';
  import Toggle from '../../lib/ui/Toggle.svelte';

  onMount(() => document.documentElement.classList.add('gallery'));
  onDestroy(() => document.documentElement.classList.remove('gallery'));

  const initialAccent = document.documentElement.dataset.accent;
  let accent = $state<Accent>(isAccent(initialAccent) ? initialAccent : DEFAULT_ACCENT);
  $effect(() => applyAccent(accent));

  // Demo values
  let hotend = $state(187);
  let fan = $state(60);
  let feedrate = $state(100);
  let beep = $state(true);
  let screenOff = $state(false);
  let name = $state('Benchy PETG');
  let gcode = $state('G28');
  let target = $state<number | null>(200);
  let baud = $state(115200);
  let modalOpen = $state(false);
  let promptOpen = $state(false);
  const demoPrompt: HostPrompt = { text: 'Filament runout detected', choices: ['Continue', 'Purge more'] };

  // Animated demo so the gauge transitions can be checked by eye.
  const timer = setInterval(() => (hotend = hotend >= 205 ? 150 : hotend + 9), 1500);
  onDestroy(() => clearInterval(timer));

  const SWATCHES = [
    'bg', 'surface', 'surface-2', 'surface-3', 'border', 'text', 'text-dim', 'text-faint',
    'accent', 'accent-strong', 'ok', 'heating', 'cooling', 'paused', 'error', 'idle',
  ];

  async function tryNumber() {
    const value = await dialogs.number({
      title: t('temps.setTarget', { heater: t('heater.tool0') }),
      value: target,
      unit: '°C',
      min: 0,
      max: 275,
      presets: settings.value.presets.map((p) => ({ label: p.name, value: p.hotend })),
    });
    if (value !== null) target = value;
  }
  async function tryConfirm() {
    const ok = await dialogs.confirm({
      title: t('job.stopTitle'),
      message: t('job.stopMessage'),
      confirmLabel: t('job.stop'),
      tone: 'danger',
    });
    toast.show(ok ? t('common.confirm') : t('common.cancel'), { tone: ok ? 'ok' : 'info' });
  }
</script>

<div class="gallery-page">
  <header>
    <h1>UI gallery <span class="dim">v{__APP_VERSION__}</span></h1>
    <div class="row">
      {#each ACCENTS as a (a)}
        <Button selected={accent === a} onclick={() => (accent = a)} data-testid="accent-{a}">{a}</Button>
      {/each}
      <Button onclick={() => settings.setLanguage(i18n.locale === 'en' ? 'it' : 'en')}>
        {i18n.locale.toUpperCase()}
      </Button>
    </div>
  </header>

  <section>
    <h2>RingGauge</h2>
    <div class="gauges">
      <RingGauge
        size="L"
        label={t('heater.tool0')}
        icon={Flame}
        value={hotend}
        target={200}
        max={275}
        unit="°"
        sublabel={t('gauge.target', { value: '200°C' })}
        tone={heaterTone(hotend, 200)}
        onclick={tryNumber}
      />
      <RingGauge
        size="L"
        label={t('heater.bed')}
        icon={Heater}
        value={60}
        target={60}
        max={110}
        unit="°"
        sublabel={t('gauge.target', { value: '60°C' })}
        tone="ok"
      />
      <RingGauge size="M" label={t('gauge.fan')} icon={Fan} value={fan} unit="%" sublabel="M106 S153" />
      <RingGauge size="M" label={t('gauge.job')} icon={Box} value={42.7} unit="%" sublabel="1:12:05" />
      <RingGauge size="M" label={t('gauge.layer')} icon={Layers} value={38} unit="%" sublabel="57 / 150" tone="paused" />
      <RingGauge size="S" label="CPU" icon={Cpu} value={23} unit="%" sublabel="52°C" />
      <RingGauge size="S" label={t('heater.chamber')} value={null} unavailable sublabel={t('gauge.unavailable')} />
    </div>
  </section>

  <section>
    <h2>Button · IconButton</h2>
    <div class="row wrap">
      <Button variant="primary" icon={Play}>{t('job.resume')}</Button>
      <Button variant="secondary" icon={House}>{t('nav.home')}</Button>
      <Button variant="secondary" selected>{t('printer.auto')}</Button>
      <Button variant="ghost">{t('common.cancel')}</Button>
      <Button variant="warning" icon={Pause}>{t('job.pause')}</Button>
      <Button variant="danger" icon={Square}>{t('job.stop')}</Button>
      <Button variant="primary" disabled>{t('common.ok')}</Button>
    </div>
    <div class="row wrap">
      <Button variant="primary" size="lg" icon={Play}>{t('job.resume')}</Button>
      <Button variant="danger" size="lg" icon={Trash2}>{t('common.delete')}</Button>
      <IconButton icon={House} label={t('nav.home')} />
      <IconButton icon={Printer} label={t('home.state')} size="lg" variant="primary" />
      <IconButton icon={Trash2} label={t('common.delete')} variant="ghost" />
      <Spinner size={40} />
    </div>
  </section>

  <section class="cols">
    <Card title="Toggle · Slider · Stepper" icon={Fan}>
      <Toggle label={t('gallery.beep')} hint="M300 S880 P400" bind:checked={beep} />
      <Toggle label={t('gallery.screenOff')} bind:checked={screenOff} />
      <Slider label={t('gauge.fan')} bind:value={fan} format={(v) => `${v}%`} />
      <Stepper label={t('gallery.feedrate')} bind:value={feedrate} min={10} max={300} step={5} format={(v) => `${v}%`} />
    </Card>
    <Card title="InputField · Select" icon={Link2}>
      <InputField label={t('gallery.name')} bind:value={name} maxLength={32} />
      <InputField label="G-code" type="gcode" bind:value={gcode} />
      <InputField label={t('temps.setTarget', { heater: t('heater.tool0') })} type="number" bind:value={target} unit="°C" min={0} max={275} />
      <Select
        label={t('printer.baudrate')}
        bind:value={baud}
        options={[0, 115200, 250000].map((b) => ({ value: b, label: b ? String(b) : t('printer.auto') }))}
      />
    </Card>
  </section>

  <section class="cols">
    <Card title="Card · InfoRow" icon={Printer}>
      <InfoRow icon={Printer} label={t('home.state')} value="Printing from SD" tone="accent" />
      <InfoRow icon={Box} label={t('home.profile')} value="Tatara A8" tone="ok" />
      <InfoRow icon={Link2} label={t('home.connection')} value="/dev/ttyACM0 @ 115200" tone="paused" />
    </Card>
    <Card title="Modal · ConfirmDialog · NumPad · Toast · PromptDialog">
      <div class="row wrap">
        <Button onclick={() => (modalOpen = true)} data-testid="open-modal">Modal</Button>
        <Button onclick={tryConfirm} data-testid="open-confirm">ConfirmDialog</Button>
        <Button onclick={tryNumber} data-testid="open-numpad">NumPad</Button>
        <Button onclick={() => (promptOpen = true)} data-testid="open-prompt">PromptDialog</Button>
        <Button onclick={() => toast.show(t('gallery.toast'), { tone: 'ok' })} data-testid="open-toast">Toast</Button>
        <Button onclick={() => toast.show(t('temps.setFailed'), { tone: 'error' })}>Toast error</Button>
      </div>
      <p class="dim">
        {t('temps.setTarget', { heater: t('heater.tool0') })}: <strong class="tabular">{target ?? '—'}°C</strong>
      </p>
    </Card>
  </section>

  <section>
    <h2>OnScreenKeyboard ({i18n.locale})</h2>
    <OnScreenKeyboard locale={i18n.locale} onchar={(c) => (name += c)} onkey={() => {}} />
  </section>
  <section>
    <h2>OnScreenKeyboard (G-code)</h2>
    <OnScreenKeyboard layer="gcode" onchar={(c) => (gcode += c)} onkey={() => {}} />
  </section>

  <section>
    <h2>Tokens</h2>
    <div class="swatches">
      {#each SWATCHES as name (name)}
        <div class="swatch"><span style:background="var(--{name})"></span>--{name}</div>
      {/each}
    </div>
    <div class="type">
      <span style:font-size="var(--fs-display)" class="tabular">12:45</span>
      <span style:font-size="var(--fs-3xl)">205°C</span>
      <span style:font-size="var(--fs-2xl)">{t('screen.home')}</span>
      <span style:font-size="var(--fs-xl)">XL 24</span>
      <span style:font-size="var(--fs-lg)">LG 20</span>
      <span style:font-size="var(--fs-md)">MD 17</span>
      <span style:font-size="var(--fs-sm)" class="dim">SM 15</span>
      <span style:font-size="var(--fs-xs)" class="dim">XS 13</span>
    </div>
  </section>
</div>

{#if modalOpen}
  <Modal title="Modal" icon={Printer} tone="accent" onclose={() => (modalOpen = false)}>
    <p>{t('screen.soon')}</p>
    {#snippet actions()}
      <Button variant="primary" size="lg" onclick={() => (modalOpen = false)}>{t('common.ok')}</Button>
    {/snippet}
  </Modal>
{/if}
{#if promptOpen}
  <PromptDialog prompt={demoPrompt} onanswer={() => (promptOpen = false)} />
{/if}

<style>
  :global(html.gallery),
  :global(html.gallery body) {
    height: auto;
    overflow: auto;
  }
  .gallery-page {
    display: flex;
    flex-direction: column;
    gap: var(--sp-5);
    width: 1024px;
    padding: var(--sp-4);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h1 {
    margin: 0;
    font-size: var(--fs-xl);
  }
  h2 {
    margin: 0 0 var(--sp-3);
    color: var(--text-dim);
    font-size: var(--fs-sm);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .dim {
    color: var(--text-dim);
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--sp-3);
  }
  .row + .row {
    margin-top: var(--sp-3);
  }
  .wrap {
    flex-wrap: wrap;
  }
  .gauges {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-around;
    gap: var(--sp-4);
    padding: var(--sp-4);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--surface);
  }
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--sp-4);
  }
  .swatches {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: var(--sp-2);
    font-size: var(--fs-sm);
    color: var(--text-dim);
  }
  .swatch {
    display: flex;
    align-items: center;
    gap: var(--sp-2);
  }
  .swatch span {
    width: 36px;
    height: 36px;
    border: 1px solid var(--border);
    border-radius: var(--r-sm);
  }
  .type {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: var(--sp-5);
    margin-top: var(--sp-4);
    font-weight: var(--fw-bold);
  }
</style>
