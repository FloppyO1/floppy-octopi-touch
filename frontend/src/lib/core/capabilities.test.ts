import { describe, expect, it } from 'vitest';
import {
  defaultCapabilityOverrides,
  parseM115Lines,
  resolveCapabilities,
  type FirmwareReport,
} from './capabilities';

// Real Marlin 2.1 M115 answer as it appears in OctoPrint's terminal log.
const MARLIN_LOG = [
  'Send: N5 M115*36',
  'Recv: FIRMWARE_NAME:Marlin bugfix-2.1.x (Sep  1 2025 10:00:00) SOURCE_CODE_URL:github.com/MarlinFirmware/Marlin PROTOCOL_VERSION:1.0 MACHINE_TYPE:Tatara A8 EXTRUDER_COUNT:1 UUID:cede2a2f-41a2-4748-9b12-c55c62f367ff',
  'Recv: Cap:SERIAL_XON_XOFF:0',
  'Recv: Cap:BINARY_FILE_TRANSFER:0',
  'Recv: Cap:EEPROM:1',
  'Recv: Cap:VOLUMETRIC:1',
  'Recv: Cap:AUTOREPORT_TEMP:1',
  'Recv: Cap:PROGRESS:0',
  'Recv: Cap:PRINT_JOB:1',
  'Recv: Cap:AUTOLEVEL:0',
  'Recv: Cap:RUNOUT:0',
  'Recv: Cap:Z_PROBE:0',
  'Recv: Cap:LEVELING_DATA:0',
  'Recv: Cap:BUILD_PERCENT:0',
  'Recv: Cap:SOFTWARE_POWER:0',
  'Recv: Cap:TOGGLE_LIGHTS:0',
  'Recv: Cap:EMERGENCY_PARSER:1',
  'Recv: Cap:HOST_ACTION_COMMANDS:1',
  'Recv: Cap:PROMPT_SUPPORT:1',
  'Recv: Cap:SDCARD:1',
  'Recv: Cap:BABYSTEPPING:1',
  'Recv: ok',
];

const empty = (): FirmwareReport => ({ firmwareName: null, caps: {} });

describe('parseM115Lines', () => {
  it('reads the firmware name and every capability', () => {
    const report = empty();
    expect(parseM115Lines(MARLIN_LOG, report)).toBe(true);
    expect(report.firmwareName).toBe('Marlin bugfix-2.1.x (Sep  1 2025 10:00:00)');
    expect(report.caps.EEPROM).toBe(true);
    expect(report.caps.AUTOLEVEL).toBe(false);
    expect(report.caps.PROMPT_SUPPORT).toBe(true);
    expect(Object.keys(report.caps)).toHaveLength(19);
  });

  it('accepts lines without the Recv prefix (Virtual Printer, messages)', () => {
    const report = empty();
    parseM115Lines(
      ['FIRMWARE_NAME:Marlin 2.1.2.4 (Virtual Tatara A8) PROTOCOL_VERSION:1.0', 'Cap:Z_PROBE:0'],
      report,
    );
    expect(report).toEqual({
      firmwareName: 'Marlin 2.1.2.4 (Virtual Tatara A8)',
      caps: { Z_PROBE: false },
    });
  });

  it('ignores unrelated lines and reports no change when nothing is new', () => {
    const report = empty();
    parseM115Lines(MARLIN_LOG, report);
    expect(parseM115Lines(MARLIN_LOG, report)).toBe(false);
    expect(parseM115Lines(['Recv: T:200.0 /200.0 B:60.0 /60.0', 'Send: Cap:EEPROM:0'], report)).toBe(false);
    expect(report.caps.EEPROM).toBe(true);
  });
});

describe('resolveCapabilities', () => {
  it('uses the firmware report, then overrides, and defaults to off', () => {
    const report = empty();
    parseM115Lines(MARLIN_LOG, report);
    const overrides = { ...defaultCapabilityOverrides(), eeprom: 'off' as const, advancedPause: 'on' as const };
    const caps = resolveCapabilities(report.caps, overrides);

    expect(caps.promptSupport).toEqual({ detected: true, override: 'auto', enabled: true });
    expect(caps.eeprom).toEqual({ detected: true, override: 'off', enabled: false });
    // Not reportable by M115: manual only.
    expect(caps.advancedPause).toEqual({ detected: null, override: 'on', enabled: true });
    expect(caps.manualMesh).toEqual({ detected: null, override: 'auto', enabled: false });
  });

  it('treats capabilities missing from the report as unknown', () => {
    const caps = resolveCapabilities({}, {});
    expect(caps.autolevel).toEqual({ detected: null, override: 'auto', enabled: false });
  });
});
