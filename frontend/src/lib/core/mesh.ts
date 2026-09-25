/**
 * Bed leveling data from the terminal log: Marlin's mesh reports, leveling state and probe offset.
 *
 * Bilinear (`M420 V`, `G29 T`):           Mesh bed leveling (`M420 V`, `G29 S0`):
 *   Recv: Bilinear Leveling Grid:            Recv: Mesh Bed Level data:
 *   Recv:       0      1      2              Recv: 3x3 mesh. Z offset: 0.00000
 *   Recv:  0 +0.125 +0.050 -0.012            Recv: Measured points:
 *   Recv:  1 +0.083 +0.000 -0.047            Recv:         0        1        2
 *   Recv:  2 +0.021 -0.036 -0.090            Recv:  0 +0.12500 +0.05000 -0.01250
 *   Recv: echo:Bed Leveling ON               …
 *
 * Each row starts with its Y index (0 = front of the bed), columns are X (0 = left). Points without
 * a value are printed as `=====` (or `nan`). A subdivided grid (`Subdivided with CATMULL ROM …`)
 * that follows the real one is ignored.
 */

export type MeshKind = 'bilinear' | 'mbl';

export interface Mesh {
  kind: MeshKind;
  /** `rows[y][x]` in mm, y = 0 is the front row. `null` = not probed. */
  rows: (number | null)[][];
}

export type LevelingFinding =
  | { type: 'mesh'; mesh: Mesh }
  /** The firmware has no valid mesh stored. */
  | { type: 'noMesh' }
  | { type: 'active'; active: boolean }
  | { type: 'probeOffset'; z: number }
  /** MBL: `G29 S2` stored the last point. */
  | { type: 'mblDone' };

const NUMBER_RE = /^[+-]?\d+(?:\.\d+)?$/;
const INDEX_RE = /^\d+$/;

/** Parses a data row: `0 +0.125 -0.050 =====` → index 0 and its values. */
function parseRow(tokens: string[]): { index: number; values: (number | null)[] } | null {
  if (tokens.length < 2 || !INDEX_RE.test(tokens[0])) return null;
  const values = tokens.slice(1).map((token) => (NUMBER_RE.test(token) ? Number(token) : null));
  // A row needs at least one number and only numbers or "not probed" markers.
  const valid = tokens.slice(1).every((token) => NUMBER_RE.test(token) || /^(?:=+|nan)$/i.test(token));
  if (!valid || values.every((v) => v === null)) return null;
  return { index: Number(tokens[0]), values };
}

const isHeader = (tokens: string[]) => tokens.length > 0 && tokens.every((token, i) => token === String(i));

/**
 * Streaming parser fed with terminal lines (only `Recv:` lines matter): the grid of a report may
 * arrive split over several socket messages.
 */
export class LevelingParser {
  private state: 'idle' | 'header' | 'rows' | 'skip' = 'idle';
  private kind: MeshKind = 'bilinear';
  private columns = 0;
  private rows = new Map<number, (number | null)[]>();

  /** Inside a report: every line matters until it ends. */
  get busy(): boolean {
    return this.state !== 'idle';
  }

  feed(line: string): LevelingFinding[] {
    const raw = line.trim();
    if (!raw.startsWith('Recv:')) return [];
    const text = raw.slice(5).trim().replace(/^echo:\s*/, '');
    const out: LevelingFinding[] = [];

    if (this.state === 'header' || this.state === 'rows' || this.state === 'skip') {
      const tokens = text.split(/\s+/);
      if (this.state === 'header' && isHeader(tokens)) {
        this.columns = tokens.length;
        this.state = 'rows';
        return out;
      }
      const row = parseRow(tokens);
      if (row && (this.state === 'skip' || this.columns === 0 || row.values.length === this.columns)) {
        if (this.state === 'skip') return out;
        // A grid without the column header row starts with the first data row.
        this.state = 'rows';
        this.rows.set(row.index, row.values);
        return out;
      }
      // Anything else ends the grid.
      if (this.state === 'rows') {
        const mesh = this.finish();
        if (mesh) out.push({ type: 'mesh', mesh });
      }
      this.state = 'idle';
    }

    if (/^Bilinear Leveling Grid:/i.test(text)) this.start('bilinear');
    else if (/^Measured points:/i.test(text)) this.start('mbl');
    else if (/^Subdivided with/i.test(text)) this.state = 'skip';
    else if (/Mesh Bed Leveling has no data|Invalid mesh|has no data/i.test(text)) out.push({ type: 'noMesh' });
    else if (/Mesh probing done/i.test(text)) out.push({ type: 'mblDone' });
    else {
      const active = /^Bed Leveling (ON|OFF)\b/i.exec(text) ?? /^Mesh Bed Leveling (ON|OFF)\b/i.exec(text);
      if (active) out.push({ type: 'active', active: active[1].toUpperCase() === 'ON' });
      // `M851 X5.00 Y5.00 Z0.20` (report and M503), `Probe Offset X0 Y0 Z-1.60`, `Probe Z Offset: -1.60`.
      const offset =
        /(?:M851|Probe Offset)\b.*?\bZ\s*:?\s*(-?\d+(?:\.\d+)?)/i.exec(text) ??
        /Probe Z Offset:?\s*(-?\d+(?:\.\d+)?)/i.exec(text);
      if (offset) out.push({ type: 'probeOffset', z: Number(offset[1]) });
    }
    return out;
  }

  /** Feeds several lines; returns everything found, in order. */
  feedAll(lines: readonly string[]): LevelingFinding[] {
    return lines.flatMap((line) => this.feed(line));
  }

  private start(kind: MeshKind): void {
    this.state = 'header';
    this.kind = kind;
    this.columns = 0;
    this.rows = new Map();
  }

  private finish(): Mesh | null {
    const count = this.rows.size;
    if (!count) return null;
    const rows: (number | null)[][] = [];
    for (let y = 0; y < count; y++) {
      const row = this.rows.get(y);
      if (!row) return null; // rows must be 0..n-1
      rows.push(row);
    }
    return { kind: this.kind, rows };
  }
}

export interface MeshStats {
  min: number;
  max: number;
  range: number;
  mean: number;
  /** Positions of the extreme points. */
  minAt: { x: number; y: number };
  maxAt: { x: number; y: number };
}

export function meshStats(mesh: Mesh): MeshStats | null {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  let minAt = { x: 0, y: 0 };
  let maxAt = { x: 0, y: 0 };
  mesh.rows.forEach((row, y) =>
    row.forEach((value, x) => {
      if (value === null) return;
      sum += value;
      count++;
      if (value < min) [min, minAt] = [value, { x, y }];
      if (value > max) [max, maxAt] = [value, { x, y }];
    }),
  );
  if (!count) return null;
  const round = (v: number) => Number(v.toFixed(4));
  return { min, max, range: round(max - min), mean: round(sum / count), minAt, maxAt };
}

/** Smallest half-range of the colour scale: a flat bed is not painted as a dramatic one. */
export const MESH_MIN_EXTENT = 0.05;

/**
 * Colour position of a point in [-1, 1]: 0 = the mesh average, ±1 = the farthest point (at least
 * `MESH_MIN_EXTENT` mm away). Negative = lower than average.
 */
export function meshTone(value: number, stats: MeshStats): number {
  const extent = Math.max(MESH_MIN_EXTENT, stats.max - stats.mean, stats.mean - stats.min);
  return Math.max(-1, Math.min(1, (value - stats.mean) / extent));
}

export function formatOffset(value: number | null | undefined, decimals = 3): string {
  if (value == null) return '—';
  const text = value.toFixed(decimals);
  return value > 0 ? `+${text}` : Number(text) === 0 ? (0).toFixed(decimals) : text;
}
