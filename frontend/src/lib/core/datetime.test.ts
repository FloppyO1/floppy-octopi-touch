import { describe, expect, it } from 'vitest';
import { analyseStopScript, expandScript, fixStopScript, FIX_COMMENT, type StopProfile } from './stopScript';
import {
  clampFields,
  clockFields,
  formatFields,
  filterZones,
  formatOffset,
  groupZones,
  isUsableTimeZone,
  OTHER_REGION,
  splitZone,
  toTimedatectl,
} from './timezone';

describe('time zones', () => {
  const zones = ['Europe/Rome', 'America/Argentina/Buenos_Aires', 'America/Sao_Paulo', 'UTC', 'Europe/Amsterdam'];

  it('splits names into region and city', () => {
    expect(splitZone('Europe/Rome')).toEqual({ region: 'Europe', city: 'Rome' });
    expect(splitZone('America/Argentina/Buenos_Aires')).toEqual({ region: 'America', city: 'Argentina/Buenos_Aires' });
    expect(splitZone('UTC')).toEqual({ region: OTHER_REGION, city: 'UTC' });
  });

  it('groups regions alphabetically, Other last', () => {
    const groups = groupZones(zones);
    expect([...groups.keys()]).toEqual(['America', 'Europe', OTHER_REGION]);
    expect(groups.get('Europe')!.map((e) => e.label)).toEqual(['Amsterdam', 'Rome']);
    expect(groups.get('America')![0]).toEqual({ zone: 'America/Argentina/Buenos_Aires', label: 'Argentina / Buenos Aires' });
  });

  it('filters cities ignoring case, accents and underscores', () => {
    const america = groupZones(zones).get('America')!;
    expect(filterZones(america, 'são').map((e) => e.zone)).toEqual(['America/Sao_Paulo']);
    expect(filterZones(america, 'buenos air').map((e) => e.zone)).toEqual(['America/Argentina/Buenos_Aires']);
    expect(filterZones(america, '  ')).toHaveLength(2);
    expect(filterZones(america, 'rome')).toEqual([]);
  });

  it('formats offsets', () => {
    expect(formatOffset(120)).toBe('UTC+02:00');
    expect(formatOffset(-210)).toBe('UTC−03:30');
    expect(formatOffset(0)).toBe('UTC');
    expect(formatOffset(null)).toBe('');
  });

  it('knows which zones the browser can use', () => {
    expect(isUsableTimeZone('Europe/Rome')).toBe(true);
    expect(isUsableTimeZone('Mars/Olympus')).toBe(false);
    expect(isUsableTimeZone(undefined)).toBe(false);
  });

  it('reads the wall clock of a zone and builds the agent format', () => {
    const moment = new Date(Date.UTC(2026, 6, 1, 22, 30)); // 1 July, summer time in Rome
    expect(clockFields(moment, 'Europe/Rome')).toEqual({ year: 2026, month: 7, day: 2, hour: 0, minute: 30 });
    expect(clockFields(moment, 'UTC')).toEqual({ year: 2026, month: 7, day: 1, hour: 22, minute: 30 });
    expect(toTimedatectl({ year: 2026, month: 3, day: 9, hour: 7, minute: 5 })).toBe('2026-03-09 07:05:00');
    expect(formatFields({ year: 2026, month: 10, day: 2, hour: 18, minute: 30 }, 'en-GB')).toMatch(/^Friday,? 2 October 2026\D+18:30$/);
  });

  it('clamps manual fields', () => {
    expect(clampFields({ year: 2026, month: 2, day: 31, hour: 24, minute: 60 })).toEqual({
      year: 2026,
      month: 2,
      day: 28,
      hour: 23,
      minute: 59,
    });
    expect(clampFields({ year: 2028, month: 2, day: 30, hour: -1, minute: 0 }).day).toBe(29);
    expect(clampFields({ year: 1990, month: 13, day: 1, hour: 0, minute: 0 })).toMatchObject({ year: 2020, month: 12 });
  });
});

describe('script after Stop', () => {
  // OctoPrint 1.11 defaults, as GET /api/settings returns them.
  const DEFAULT = {
    afterPrintCancelled:
      "; disable motors\nM84\n\n;disable all heaters\n{% snippet 'disable_hotends' %}\n{% snippet 'disable_bed' %}\n;disable fan\nM106 S0",
    'snippets/disable_bed': '{% if printer_profile.heatedBed %}M140 S0\n{% endif %}',
    'snippets/disable_hotends':
      '{% if printer_profile.extruder.sharedNozzle %}M104 T0 S0\n{% else %}{% for tool in range(printer_profile.extruder.count) %}M104 T{{ tool }} S0\n{% endfor %}{% endif %}',
  };
  const ONE: StopProfile = { extruders: 1, sharedNozzle: false, heatedBed: true };
  const TWO: StopProfile = { extruders: 2, sharedNozzle: false, heatedBed: true };
  const with_ = (afterPrintCancelled: string) => ({ ...DEFAULT, afterPrintCancelled });

  it('accepts the default script', () => {
    expect(analyseStopScript(DEFAULT, ONE)).toEqual({ motors: 'ok', hotends: 'ok', bed: 'ok', fan: 'ok', missing: [] });
    expect(analyseStopScript(DEFAULT, TWO).missing).toEqual([]);
    expect(expandScript(DEFAULT.afterPrintCancelled, DEFAULT)).toContain('M104 T{{ tool }} S0');
  });

  it('finds what is missing, in the order the fix adds it', () => {
    const status = analyseStopScript(with_(";disable all heaters\n{% snippet 'disable_hotends' %}\nM106 S0"), ONE);
    expect(status).toMatchObject({ motors: 'missing', hotends: 'ok', bed: 'missing', fan: 'ok' });
    expect(status.missing).toEqual(['M140 S0', 'M84']);
    expect(analyseStopScript({ afterPrintCancelled: '' }, TWO).missing).toEqual([
      'M104 T0 S0',
      'M104 T1 S0',
      'M140 S0',
      'M106 S0',
      'M84',
    ]);
    expect(analyseStopScript({}, ONE).motors).toBe('missing');
  });

  it('ignores commented lines and Jinja comments', () => {
    const status = analyseStopScript(with_('; M84\n;M104 S0\n{# M140 S0 #}\nM106 S0 ; fan'), ONE);
    expect(status.missing).toEqual(['M104 T0 S0', 'M140 S0', 'M84']);
  });

  it('understands the variants', () => {
    expect(analyseStopScript(with_('M18\nM104 S0\nM140 S0.0\nM107'), ONE).missing).toEqual([]);
    // M84 S<n> only sets the idle timeout; partial axes do not free the bed.
    expect(analyseStopScript(with_('M84 S60\nM104 S0\nM140 S0\nM107'), ONE).motors).toBe('missing');
    expect(analyseStopScript(with_('M84 X Y\nM104 S0\nM140 S0\nM107'), ONE).motors).toBe('missing');
    expect(analyseStopScript(with_('M84 X Y Z E\nM104 S0\nM140 S0\nM107'), ONE).motors).toBe('ok');
    // A plain M104 S0 only turns the active tool off.
    expect(analyseStopScript(with_('M84\nM104 S0\nM140 S0\nM107'), TWO).missing).toEqual(['M104 T0 S0', 'M104 T1 S0']);
    expect(analyseStopScript(with_('M84\nM104 T1 S0\nM140 S0\nM107'), TWO).missing).toEqual(['M104 T0 S0']);
    expect(analyseStopScript(with_('M84\nM104 T0 S200\nM140 S0\nm106 s0'), ONE).hotends).toBe('missing');
    expect(analyseStopScript(with_('M84\nM104 T0 S0\nM106 P1 S0'), ONE).fan).toBe('ok');
  });

  it('skips the bed without a heated bed, one nozzle when it is shared', () => {
    const status = analyseStopScript({ afterPrintCancelled: '' }, { extruders: 3, sharedNozzle: true, heatedBed: false });
    expect(status.bed).toBe('na');
    expect(status.missing).toEqual(['M104 T0 S0', 'M106 S0', 'M84']);
  });

  it('appends only the missing lines, keeping the script', () => {
    const script = ';disable all heaters\nM104 S0\n\n';
    expect(fixStopScript(script, ['M140 S0', 'M84'])).toBe(
      `;disable all heaters\nM104 S0\n\n${FIX_COMMENT}\nM140 S0\nM84\n`,
    );
    expect(fixStopScript('', ['M84'])).toBe(`${FIX_COMMENT}\nM84\n`);
    expect(fixStopScript(script, [])).toBe(script);
    const fixed = with_(fixStopScript(';nothing', analyseStopScript(with_(';nothing'), ONE).missing));
    expect(analyseStopScript(fixed, ONE).missing).toEqual([]);
  });
});
