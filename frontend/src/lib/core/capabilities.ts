/**
 * Firmware capabilities: Marlin's M115 report (`Cap:NAME:0|1`) plus manual overrides for features
 * that M115 does not expose (M600, M701/M702, manual mesh bed leveling, M486 cancel objects).
 */

/** Dashboard feature → Marlin capability name (`null` = not reported by M115, manual only). */
export const CAPABILITIES = {
  autolevel: 'AUTOLEVEL',
  zProbe: 'Z_PROBE',
  levelingData: 'LEVELING_DATA',
  eeprom: 'EEPROM',
  emergencyParser: 'EMERGENCY_PARSER',
  promptSupport: 'PROMPT_SUPPORT',
  hostActionCommands: 'HOST_ACTION_COMMANDS',
  babystepping: 'BABYSTEPPING',
  runout: 'RUNOUT',
  sdCard: 'SDCARD',
  advancedPause: null, // M600
  filamentLoadUnload: null, // M701 / M702
  manualMesh: null, // G29 with MESH_BED_LEVELING (G29 S1/S2)
  cancelObjects: null, // M486 (CANCEL_OBJECTS)
} as const;

export type CapabilityKey = keyof typeof CAPABILITIES;
export type CapabilityOverride = 'auto' | 'on' | 'off';
export type CapabilityOverrides = Record<CapabilityKey, CapabilityOverride>;

export const CAPABILITY_KEYS = Object.keys(CAPABILITIES) as CapabilityKey[];

export interface FirmwareReport {
  firmwareName: string | null;
  /** Raw `Cap:` values by Marlin name. */
  caps: Record<string, boolean>;
}

const CAP_RE = /^(?:Recv:\s*)?Cap:([A-Z0-9_]+):([01])\s*$/;
const NAME_RE = /^(?:Recv:\s*)?FIRMWARE_NAME:(.*?)(?:\s+(?:SOURCE_CODE_URL|PROTOCOL_VERSION|MACHINE_TYPE|EXTRUDER_COUNT|UUID):|$)/;

/**
 * Feeds terminal lines (`Recv: Cap:EEPROM:1`, `Recv: FIRMWARE_NAME:Marlin …`) into `report`.
 * Returns true when something changed.
 */
export function parseM115Lines(lines: readonly string[], report: FirmwareReport): boolean {
  let changed = false;
  for (const raw of lines) {
    const line = raw.trim();
    const cap = CAP_RE.exec(line);
    if (cap) {
      const value = cap[2] === '1';
      if (report.caps[cap[1]] !== value) {
        report.caps[cap[1]] = value;
        changed = true;
      }
      continue;
    }
    const name = NAME_RE.exec(line);
    if (name) {
      const firmwareName = name[1].trim() || null;
      if (report.firmwareName !== firmwareName) {
        report.firmwareName = firmwareName;
        changed = true;
      }
    }
  }
  return changed;
}

export interface CapabilityState {
  /** Value reported by the firmware, `null` if unknown or not reportable. */
  detected: boolean | null;
  override: CapabilityOverride;
  /** What the UI should use. */
  enabled: boolean;
}

export function resolveCapabilities(
  caps: Record<string, boolean>,
  overrides: Partial<CapabilityOverrides>,
): Record<CapabilityKey, CapabilityState> {
  const result = {} as Record<CapabilityKey, CapabilityState>;
  for (const key of CAPABILITY_KEYS) {
    const marlin = CAPABILITIES[key];
    const detected = marlin !== null && marlin in caps ? caps[marlin] : null;
    const override = overrides[key] ?? 'auto';
    const enabled = override === 'on' ? true : override === 'off' ? false : (detected ?? false);
    result[key] = { detected, override, enabled };
  }
  return result;
}

export function defaultCapabilityOverrides(): CapabilityOverrides {
  return Object.fromEntries(CAPABILITY_KEYS.map((k) => [k, 'auto'])) as CapabilityOverrides;
}
