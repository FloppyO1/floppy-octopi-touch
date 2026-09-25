/** Printer state (flags from the push API) and job/progress. */
import { job as jobApi, printer as printerApi } from '../api/octoprint';
import type { Axis, CurrentPayload, JobInfo, JobProgress, PrinterState } from '../api/types';
import { DLP_SOCKET_PLUGIN, parseLayerInfo } from '../core/layer';
import type { HeadPosition } from '../core/move';
import type { LocalActions } from '../core/notices';
import { JOB_PHASES, printerPhase } from '../core/printerState';
import { server } from './server.svelte';
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

  /** Head position from the last M114 answer (`PositionUpdate` event), `null` when unknown. */
  position = $state.raw<HeadPosition | null>(null);
  private positionTimer: ReturnType<typeof setTimeout> | null = null;

  update(payload: Partial<CurrentPayload>): void {
    if (payload.state && !sameJson(payload.state, this.state)) this.state = payload.state;
    if (payload.currentZ !== undefined) this.currentZ = payload.currentZ;
    if (payload.offsets && !sameJson(payload.offsets, this.offsets)) this.offsets = payload.offsets;
    if (payload.busyFiles && !sameJson(payload.busyFiles, this.busyFiles)) {
      this.busyFiles = payload.busyFiles;
    }
  }

  setPosition(position: HeadPosition | null): void {
    if (!sameJson(position, this.position)) this.position = position;
  }

  /**
   * M114 answer (`PositionUpdate`). Ignored when a jog was sent after the last request: it does not
   * include that move yet, and the jog has already scheduled a newer request.
   */
  reportPosition(position: HeadPosition | null): void {
    if (this.jogAt > this.requestedAt) return;
    this.setPosition(position);
  }

  private requestedAt = 0;
  private jogAt = 0;

  /**
   * Asks the firmware for the position; the answer arrives as a `PositionUpdate` event. M400 first:
   * the report then comes after the queued moves (the Virtual Printer answers M114 right away).
   */
  requestPosition = () => {
    this.requestedAt = performance.now();
    return printerApi.command(['M400', 'M114']);
  };

  /** One M114 after a burst of jogs. */
  schedulePositionRequest(delayMs = 600): void {
    if (this.positionTimer) clearTimeout(this.positionTimer);
    this.positionTimer = setTimeout(() => {
      this.positionTimer = null;
      void this.requestPosition().catch(() => undefined);
    }, delayMs);
  }

  home = async (axes: Axis[] = ['x', 'y', 'z']) => {
    await printerApi.home(axes);
    // Queued after G28: answered once homing is done.
    if (this.position) this.position = { ...this.position, ...Object.fromEntries(axes.map((a) => [a, null])) };
    void this.requestPosition().catch(() => undefined);
  };

  /** Relative jog in machine coordinates; the known position moves with it until M114 confirms it. */
  jog = async (axis: Axis, amount: number, speed?: number) => {
    // Updated before sending, so that quick successive taps are limited from the right place.
    const current = this.position?.[axis];
    if (this.position && current != null) {
      this.position = { ...this.position, [axis]: Number((current + amount).toFixed(3)) };
    }
    this.jogAt = performance.now();
    try {
      await printerApi.jog({ [axis]: amount }, { speed });
    } finally {
      this.schedulePositionRequest();
    }
  };

  /** M84: the steppers lose their position, so it becomes unknown. */
  motorsOff = async () => {
    await printerApi.command('M84');
    this.position = null;
  };
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
  /** Current/total layer, only with the DisplayLayerProgress plugin. */
  layer = $derived(
    server.plugins.displayLayerProgress ? parseLayerInfo(server.pluginMessages[DLP_SOCKET_PLUGIN]) : null,
  );

  update(payload: Partial<CurrentPayload>): void {
    if (payload.job && !sameJson(payload.job, this.info)) this.info = payload.job;
    if (payload.progress && !sameJson(payload.progress, this.progress)) {
      this.progress = payload.progress;
      this.updatedAt = Date.now();
    }
  }

  /** Pause/cancel requested from this dashboard (their events are not announced again). */
  readonly local: LocalActions = {};

  start = () => jobApi.start();
  pause = () => {
    this.local.pauseAt = Date.now();
    return jobApi.pause();
  };
  resume = () => jobApi.resume();
  cancel = () => {
    this.local.cancelAt = Date.now();
    return jobApi.cancel();
  };
}

export const printer = new PrinterStore();
export const job = new JobStore();
