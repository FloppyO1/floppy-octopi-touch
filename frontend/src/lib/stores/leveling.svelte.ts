/**
 * Bed leveling state read from the terminal log (mesh reports, leveling on/off, probe Z offset) and
 * the progress of the dashboard's own procedures (paper test point, manual mesh, babysteps).
 */
import type { LevelingPointId } from '../core/leveling';
import { LevelingParser, type Mesh } from '../core/mesh';
import { terminal } from './terminal.svelte';

/** Manual mesh (MBL) in progress: `point` is the 1-based point the nozzle is at (0 = homing). */
export interface MblRun {
  point: number;
}

class LevelingStore {
  mesh = $state.raw<Mesh | null>(null);
  /** Local time of the last mesh report. */
  meshAt = $state(0);
  /** The firmware answered that it has no valid mesh. */
  noMesh = $state(false);
  /** Bed leveling compensation on/off, `null` until reported. */
  active = $state<boolean | null>(null);
  probeOffsetZ = $state<number | null>(null);
  /** Sum of the babysteps sent on this connection (mm). */
  babystepTotal = $state(0);
  /** Paper test: the point the nozzle was last sent to. */
  point = $state<LevelingPointId | null>(null);
  mbl = $state.raw<MblRun | null>(null);

  private parser = new LevelingParser();

  /** Terminal lines; `live` = not the `history` replay (procedures only react to live lines). */
  ingest(lines: readonly string[] | undefined, live: boolean): void {
    if (!lines?.length) return;
    // Cheap pre-filter: nearly every line is a temperature report or an `ok`.
    if (!this.parser.busy && !lines.some((l) => /Grid|points|mesh|Leveling|M851|Offset|probing/i.test(l))) return;
    for (const finding of this.parser.feedAll(lines)) {
      switch (finding.type) {
        case 'mesh':
          this.mesh = finding.mesh;
          this.meshAt = Date.now();
          this.noMesh = false;
          break;
        case 'noMesh':
          this.noMesh = true;
          break;
        case 'active':
          this.active = finding.active;
          break;
        case 'probeOffset':
          this.probeOffsetZ = finding.z;
          break;
        case 'mblDone':
          if (live && this.mbl) {
            this.mbl = null;
            // Marlin homes after the last point; the report is queued behind it.
            void terminal.send('M420 V').catch(() => undefined);
          }
          break;
      }
    }
  }

  /** Printer disconnected: firmware state is unknown again (the last mesh stays on screen). */
  reset(): void {
    this.active = null;
    this.probeOffsetZ = null;
    this.babystepTotal = 0;
    this.point = null;
    this.mbl = null;
  }
}

export const leveling = new LevelingStore();
