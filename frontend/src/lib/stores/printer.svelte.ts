/** Printer state (flags from the push API) and job/progress. */
import { job as jobApi } from '../api/octoprint';
import type { CurrentPayload, JobInfo, JobProgress, PrinterState } from '../api/types';
import { JOB_PHASES, printerPhase } from '../core/printerState';
import { sameJson } from './util';

class PrinterStore {
  state = $state.raw<PrinterState | null>(null);
  currentZ = $state<number | null>(null);
  offsets = $state.raw<Record<string, number>>({});
  busyFiles = $state.raw<CurrentPayload['busyFiles']>([]);

  phase = $derived(printerPhase(this.state));
  operational = $derived(this.state?.flags.operational === true);
  /** A job is running, paused or being cancelled: limit manual control. */
  busy = $derived(JOB_PHASES.includes(this.phase));
  sdReady = $derived(this.state?.flags.sdReady === true);

  update(payload: Partial<CurrentPayload>): void {
    if (payload.state && !sameJson(payload.state, this.state)) this.state = payload.state;
    if (payload.currentZ !== undefined) this.currentZ = payload.currentZ;
    if (payload.offsets && !sameJson(payload.offsets, this.offsets)) this.offsets = payload.offsets;
    if (payload.busyFiles && !sameJson(payload.busyFiles, this.busyFiles)) {
      this.busyFiles = payload.busyFiles;
    }
  }
}

class JobStore {
  info = $state.raw<JobInfo | null>(null);
  progress = $state.raw<JobProgress | null>(null);
  /** Local time of the last progress update (to compute the ETA). */
  updatedAt = $state<number>(0);

  file = $derived(this.info?.file?.name ? this.info.file : null);
  /** 0-100, `null` without a job. */
  completion = $derived(this.progress?.completion ?? null);
  eta = $derived(
    this.progress?.printTimeLeft != null
      ? new Date(this.updatedAt + this.progress.printTimeLeft * 1000)
      : null,
  );

  update(payload: Partial<CurrentPayload>): void {
    if (payload.job && !sameJson(payload.job, this.info)) this.info = payload.job;
    if (payload.progress && !sameJson(payload.progress, this.progress)) {
      this.progress = payload.progress;
      this.updatedAt = Date.now();
    }
  }

  start = () => jobApi.start();
  pause = () => jobApi.pause();
  resume = () => jobApi.resume();
  cancel = () => jobApi.cancel();
}

export const printer = new PrinterStore();
export const job = new JobStore();
