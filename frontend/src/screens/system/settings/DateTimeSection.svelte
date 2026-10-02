<script lang="ts">
  // Date, time and time zone of the Pi (agent /local/time → timedatectl), and the clock format.
  import CalendarClock from '@lucide/svelte/icons/calendar-clock';
  import Clock from '@lucide/svelte/icons/clock';
  import Globe from '@lucide/svelte/icons/globe';
  import RotateCcw from '@lucide/svelte/icons/rotate-ccw';
  import { onMount } from 'svelte';
  import { HttpError } from '../../../lib/api/http';
  import { formatClock, formatLongDate } from '../../../lib/core/format';
  import {
    clampFields,
    clockFields,
    cityLabel,
    formatFields,
    formatOffset,
    OTHER_REGION,
    splitZone,
    toTimedatectl,
    type ClockFields,
  } from '../../../lib/core/timezone';
  import { i18n, t } from '../../../lib/i18n/index.svelte';
  import { clock, idle, settings } from '../../../lib/stores';
  import Button from '../../../lib/ui/Button.svelte';
  import Card from '../../../lib/ui/Card.svelte';
  import { dialogs } from '../../../lib/ui/dialogs.svelte';
  import InputField from '../../../lib/ui/InputField.svelte';
  import { toast } from '../../../lib/ui/toast.svelte';
  import Toggle from '../../../lib/ui/Toggle.svelte';
  import TimeZonePicker from './TimeZonePicker.svelte';

  const s = $derived(settings.value);
  const hour12 = $derived(!s.clock24h);
  const time = $derived(clock.time);
  const ready = $derived(time?.available ? time : null);
  const editable = $derived(ready?.canChange === true);
  let busy = $state(false);
  let picking = $state(false);
  let fields = $state<ClockFields>(clockFields(new Date()));

  const zoneLine = $derived.by(() => {
    if (!ready) return '';
    const { region, city } = splitZone(ready.timezone);
    // Fixed offsets (UTC, Etc/GMT+3) have no summer time: their name and offset say it all.
    const fixed = region === OTHER_REGION || region === 'Etc';
    const name = fixed ? cityLabel(city) : `${region} / ${cityLabel(city)}`;
    const offset = formatOffset(ready.utcOffsetMinutes);
    const season = fixed || ready.dst === null ? '' : t(ready.dst ? 'datetime.summerTime' : 'datetime.standardTime');
    return [name, offset === name ? '' : offset, season].filter(Boolean).join(' · ');
  });
  const syncLine = $derived(
    !ready ? '' : ready.ntp ? t(ready.synchronized ? 'datetime.synced' : 'datetime.notSynced') : t('datetime.manualClock'),
  );

  function resetFields() {
    fields = clockFields(new Date(ready?.now ?? Date.now()), clock.timeZone);
  }

  function setField(key: keyof ClockFields, value: number) {
    fields = clampFields({ ...fields, [key]: value });
  }

  function reason(error: unknown): string {
    if (error instanceof HttpError) {
      try {
        const detail = JSON.parse(error.body ?? '').detail;
        if (detail) return String(detail);
      } catch {
        /* not JSON */
      }
      return `HTTP ${error.status}`;
    }
    return String(error);
  }

  async function run<T>(work: () => Promise<T>): Promise<T | null> {
    busy = true;
    try {
      return await work();
    } catch (error) {
      toast.show(t('datetime.failed', { detail: reason(error) }), { tone: 'error' });
      return null;
    } finally {
      busy = false;
    }
  }

  async function chooseZone(zone: string) {
    picking = false;
    if (zone === ready?.timezone) return;
    const state = await run(() => clock.change({ timezone: zone }));
    if (state) {
      toast.show(t('datetime.zoneApplied', { zone }), { tone: 'ok' });
      resetFields();
    }
  }

  async function setNtp(on: boolean) {
    const state = await run(() => clock.change({ ntp: on }));
    if (state) {
      toast.show(t(on ? 'datetime.autoOn' : 'datetime.autoOff'));
      resetFields();
    }
  }

  async function applyManual() {
    const when = formatFields(fields, i18n.locale, hour12);
    const ok = await dialogs.confirm({
      title: t('datetime.confirmTitle'),
      message: t('datetime.confirmMessage', { when, zone: ready?.timezone ?? '' }),
      confirmLabel: t('datetime.apply'),
      tone: 'warning',
    });
    if (!ok) return;
    const state = await run(() => clock.change({ datetime: toTimedatectl(fields) }));
    if (state) {
      // The wall clock jumped: the inactivity timer starts again instead of firing at once.
      idle.touch();
      toast.show(t('datetime.applied', { when }), { tone: 'ok' });
    }
  }

  onMount(() => {
    void run(() => clock.refresh(true)).then(resetFields);
  });
</script>

<Card title={t('datetime.title')} icon={CalendarClock}>
  <div class="now" data-testid="datetime-now">
    <span class="clock tabular">{formatClock(clock.now, hour12, true)}</span>
    <span class="date">{formatLongDate(clock.now, i18n.locale, true)}</span>
  </div>
  {#if ready}
    <p class="line" data-testid="datetime-zone-line">{zoneLine}</p>
    <p class="line" class:warn={ready.ntp && !ready.synchronized} data-testid="datetime-sync">{syncLine}</p>
    {#if !ready.canChange}<p class="warn">{t('datetime.readOnly')}</p>{/if}
    {#if ready.backend === 'fake'}<p class="note">{t('datetime.simulated')}</p>{/if}
  {:else if time && !time.available}
    <p class="warn" data-testid="datetime-unavailable">{t('datetime.unavailable', { detail: time.detail })}</p>
  {/if}
</Card>

{#if ready}
  <Card title={t('datetime.zone')} icon={Globe}>
    <p class="hint">{t('datetime.zoneHint')}</p>
    <div>
      <Button
        icon={Globe}
        disabled={!editable || busy || !ready.timezones?.length}
        onclick={() => (picking = true)}
        data-testid="datetime-zone"
      >
        {ready.timezones?.length ? t('datetime.zoneChange') : t('datetime.loadingZones')}
      </Button>
    </div>
  </Card>

  <Card title={t('datetime.manual')} icon={Clock}>
    <div data-testid="datetime-ntp">
      <Toggle
        label={t('datetime.auto')}
        hint={ready.ntpAvailable ? t('datetime.autoHint') : t('datetime.autoUnavailable')}
        checked={ready.ntp}
        disabled={!editable || busy || (!ready.ntpAvailable && !ready.ntp)}
        onchange={setNtp}
      />
    </div>
    <p class="hint">{ready.ntp ? t('datetime.manualNeedsOff') : t('datetime.manualHint')}</p>
    <div class="fields">
      <InputField type="number" label={t('datetime.day')} value={fields.day} min={1} max={31} disabled={ready.ntp || !editable} onchange={(v) => setField('day', v)} testid="datetime-day" />
      <InputField type="number" label={t('datetime.month')} value={fields.month} min={1} max={12} disabled={ready.ntp || !editable} onchange={(v) => setField('month', v)} testid="datetime-month" />
      <InputField type="number" label={t('datetime.year')} value={fields.year} min={2020} max={2099} disabled={ready.ntp || !editable} onchange={(v) => setField('year', v)} testid="datetime-year" />
      <InputField type="number" label={t('datetime.hour')} value={fields.hour} min={0} max={23} disabled={ready.ntp || !editable} onchange={(v) => setField('hour', v)} testid="datetime-hour" />
      <InputField type="number" label={t('datetime.minute')} value={fields.minute} min={0} max={59} disabled={ready.ntp || !editable} onchange={(v) => setField('minute', v)} testid="datetime-minute" />
    </div>
    <div class="row">
      <Button icon={RotateCcw} disabled={ready.ntp || !editable || busy} onclick={resetFields} data-testid="datetime-reset">{t('datetime.fromNow')}</Button>
      <Button variant="primary" icon={Clock} disabled={ready.ntp || !editable || busy} onclick={applyManual} data-testid="datetime-apply">{t('datetime.apply')}</Button>
    </div>
  </Card>
{/if}

<Card title={t('datetime.format')} icon={Clock}>
  <div data-testid="clock24h">
    <Toggle
      label={t('settings.clock24h')}
      hint={t('settings.clock24hHint')}
      checked={s.clock24h}
      onchange={(on) => settings.update((v) => (v.clock24h = on))}
    />
  </div>
</Card>

{#if picking && ready?.timezones}
  <TimeZonePicker zones={ready.timezones} current={ready.timezone} onselect={chooseZone} onclose={() => (picking = false)} />
{/if}

<style>
  .now {
    display: flex;
    align-items: baseline;
    gap: var(--sp-4);
  }
  .clock {
    color: var(--text);
    font-size: var(--fs-2xl);
    font-weight: var(--fw-bold);
  }
  .date {
    color: var(--text);
    font-size: var(--fs-lg);
  }
  .line {
    margin: 0;
    color: var(--text);
    font-size: var(--fs-md);
  }
  .hint,
  .note {
    margin: 0;
    color: var(--text-dim);
    font-size: var(--fs-sm);
  }
  .warn {
    margin: 0;
    color: var(--paused);
    font-size: var(--fs-sm);
  }
  .fields {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: var(--sp-2);
  }
  .row {
    display: flex;
    justify-content: flex-end;
    gap: var(--sp-3);
  }
</style>
