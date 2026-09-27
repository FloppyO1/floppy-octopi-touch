/**
 * Cancel single objects during a print (docs/PLAN.md, session 11).
 *
 * Two mechanisms, chosen automatically:
 *   m486    the firmware has CANCEL_OBJECTS (manual capability: M115 does not report it); the objects
 *           are the `M486 S<n>` indices of the file, cancelled with `M486 P<n>`
 *   plugin  the Cancel Objects OctoPrint plugin; its object list (ids by first appearance in the file)
 *           comes from `objlist` / socket messages, cancelled with its `cancel` command
 * The footprints always come from the agent (`/local/objects`), matched by object name.
 */
import type { PrinterProfile } from '../api/types';

export type CancelMethod = 'm486' | 'plugin' | 'none';

/** M486 wins when both are available: the firmware skips the moves itself. */
export function cancelMethod(m486: boolean, plugin: boolean): CancelMethod {
  return m486 ? 'm486' : plugin ? 'plugin' : 'none';
}

export type Point = [number, number];

/** One object of the file, from the agent. */
export interface FileObject {
  name: string;
  m486: number | null;
  polygon: Point[];
  center: Point | null;
  bbox: [number, number, number, number] | null;
}

export interface ObjectsReport {
  objects: FileObject[];
  /** Label formats found: comments, plugin, m486, cura, klipper. */
  labels: string[];
  /** Rewritten by the Cancel Objects plugin when uploaded (needed by the plugin). */
  processed: boolean;
  truncated: boolean;
}

/** An entry of the plugin's list (`objlist` / `{"objects": [...]}` socket message). */
export interface PluginObject {
  id: number;
  object: string;
  cancelled: boolean;
  ignore: boolean;
}

/** What the firmware was told, from the `Send: M486 …` lines of the terminal log. */
export interface M486State {
  active: number | null;
  cancelled: number[];
}

export const emptyM486 = (): M486State => ({ active: null, cancelled: [] });

const M486_RE = /^Send:\s*(?:N\d+\s+)?M486(?![0-9])([^*;]*)/i;

/** Updates `state` from terminal lines; returns the new state (same object when nothing changed). */
export function ingestM486(lines: readonly string[], state: M486State): M486State {
  let next = state;
  const edit = () => (next === state ? (next = { active: state.active, cancelled: [...state.cancelled] }) : next);
  for (const line of lines) {
    const match = M486_RE.exec(line.trim());
    if (!match) continue;
    for (const word of match[1].trim().split(/\s+/)) {
      const key = word[0]?.toUpperCase();
      // `M486 A<name>`: the rest of the line is the name ("… copy 0" must not read as C).
      if (key === 'A') break;
      const value = Number.parseInt(word.slice(1), 10);
      if (key === 'T') {
        edit();
        next.active = null;
        next.cancelled = [];
      } else if (key === 'S' && Number.isFinite(value)) {
        edit().active = value < 0 ? null : value;
      } else if (key === 'P' && Number.isFinite(value) && !next.cancelled.includes(value)) {
        edit().cancelled.push(value);
      } else if (key === 'U' && Number.isFinite(value)) {
        edit().cancelled = next.cancelled.filter((i) => i !== value);
      } else if (word.toUpperCase() === 'C' && next.active !== null && !next.cancelled.includes(next.active)) {
        edit().cancelled.push(next.active);
      }
    }
  }
  return next;
}

/** An object as the UI shows it. */
export interface PrintObject {
  key: string;
  /** 1-based number drawn on the map and in the list (objects can share a name). */
  number: number;
  name: string;
  polygon: Point[];
  center: Point | null;
  cancelled: boolean;
  active: boolean;
  /** Plugin id or M486 index for the cancel command; null = cannot be cancelled. */
  target: number | null;
}

/** "Shape-Box id:0 copy 1" (PrusaSlicer / OrcaSlicer instance names) → "Shape-Box". */
export function displayName(raw: string): string {
  const name = raw.replace(/\s+id:\d+\s+copy\s+\d+\s*$/i, '').trim();
  return name || raw;
}

interface BuildInput {
  method: CancelMethod;
  report: ObjectsReport | null;
  plugin: readonly PluginObject[];
  pluginActive: number | null;
  m486: M486State;
}

export function buildObjects({ method, report, plugin, pluginActive, m486 }: BuildInput): PrintObject[] {
  const geometry = new Map((report?.objects ?? []).map((o) => [o.name, o]));
  const shape = (name: string) => {
    const g = geometry.get(name);
    return { polygon: g?.polygon ?? [], center: g?.center ?? null };
  };
  let objects: Omit<PrintObject, 'number'>[];
  const visiblePlugin = plugin.filter((p) => !p.ignore);
  if (method === 'plugin' && visiblePlugin.length > 0) {
    objects = [...visiblePlugin]
      .sort((a, b) => a.id - b.id)
      .map((p) => ({
        key: `plugin:${p.id}`,
        name: displayName(p.object),
        ...shape(p.object),
        cancelled: p.cancelled,
        active: p.id === pluginActive,
        target: p.id,
      }));
  } else if (method === 'm486') {
    objects = (report?.objects ?? [])
      .filter((o) => o.m486 !== null)
      .sort((a, b) => (a.m486 ?? 0) - (b.m486 ?? 0))
      .map((o) => ({
        key: `m486:${o.m486}`,
        name: displayName(o.name),
        polygon: o.polygon,
        center: o.center,
        cancelled: m486.cancelled.includes(o.m486 as number),
        active: m486.active === o.m486,
        target: o.m486,
      }));
  } else {
    // Nothing to cancel with (or the plugin has no list for this file): shapes only.
    objects = (report?.objects ?? []).map((o) => ({
      key: `file:${o.name}`,
      name: displayName(o.name),
      polygon: o.polygon,
      center: o.center,
      cancelled: false,
      active: false,
      target: null,
    }));
  }
  return objects.map((o, i) => ({ ...o, number: i + 1 }));
}

/** Objects that will still be printed. */
export const remaining = (objects: readonly PrintObject[]) => objects.filter((o) => !o.cancelled).length;

// ------------------------------------------------------------------ bed map

export interface Bed {
  minX: number;
  minY: number;
  width: number;
  depth: number;
  circular: boolean;
}

const DEFAULT_BED: Bed = { minX: 0, minY: 0, width: 220, depth: 220, circular: false };

/** Printable area of the printer profile (origin lower left or centre). */
export function bedFromProfile(profile: PrinterProfile | null): Bed {
  const volume = profile?.volume;
  if (!volume || !(volume.width > 0) || !(volume.depth > 0)) return DEFAULT_BED;
  const centred = volume.origin === 'center';
  return {
    minX: centred ? -volume.width / 2 : 0,
    minY: centred ? -volume.depth / 2 : 0,
    width: volume.width,
    depth: volume.depth,
    circular: volume.formFactor === 'circular',
  };
}

/** Bed millimetres → SVG user units (viewBox `0 0 width depth`, Y pointing down). */
export function toSvg([x, y]: Point, bed: Bed): Point {
  return [round(x - bed.minX), round(bed.depth - (y - bed.minY))];
}

export const svgPoints = (polygon: readonly Point[], bed: Bed) =>
  polygon.map((p) => toSvg(p, bed).join(',')).join(' ');

const round = (v: number) => Math.round(v * 100) / 100;
