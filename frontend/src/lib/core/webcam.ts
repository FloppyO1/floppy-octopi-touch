/**
 * Webcam stream to show on the Home screen.
 *
 * OctoPrint ≥ 1.9 lists webcams from provider plugins in `/api/settings` → `webcam.webcams[]`;
 * the bundled "classicwebcam" exposes its URLs as `compat.stream` / `compat.snapshot`. On OctoPi the
 * stream URL is the relative `/webcam/?action=stream`, which the agent proxies to camera-streamer
 * (so it keeps working offline and without knowing the Pi's address). A manual URL from the
 * dashboard settings wins over OctoPrint's.
 */
import type { OctoPrintSettings } from '../api/types';

export interface WebcamSource {
  stream: string;
  snapshot: string | null;
  flipH: boolean;
  flipV: boolean;
  rotate90: boolean;
  /** Width / height, from OctoPrint's `streamRatio` ("16:9" or "4:3"). */
  ratio: number;
}

function parseRatio(value: string | undefined): number {
  const match = /^(\d+):(\d+)$/.exec(value ?? '');
  return match && Number(match[2]) > 0 ? Number(match[1]) / Number(match[2]) : 16 / 9;
}

/** Only URLs the kiosk browser can load: relative (through the agent) or http(s). */
function usable(url: string | undefined | null): url is string {
  return !!url && (url.startsWith('/') || /^https?:\/\//i.test(url));
}

export function resolveWebcam(
  settings: OctoPrintSettings | null,
  manualUrl = '',
): WebcamSource | null {
  const manual = manualUrl.trim();
  const webcam = settings?.webcam;
  const first = webcam?.webcams?.[0];
  const transform = {
    flipH: first?.flipH ?? false,
    flipV: first?.flipV ?? false,
    rotate90: first?.rotate90 ?? false,
    ratio: parseRatio(first?.compat?.streamRatio),
  };
  if (usable(manual)) return { stream: manual, snapshot: null, ...transform };
  if (!webcam || webcam.webcamEnabled === false) return null;

  const stream = first?.compat?.stream ?? webcam.streamUrl;
  if (!usable(stream)) return null;
  const snapshot = first?.compat?.snapshot ?? webcam.snapshotUrl;
  // `http://localhost:8080/…` (OctoPrint's server-side snapshot URL) is fine on the Pi's kiosk,
  // which runs on the same host; relative and other absolute URLs are used as they are.
  return { stream, snapshot: usable(snapshot) ? snapshot : null, ...transform };
}

/** CSS transform for the flip/rotate options of the webcam. */
export function webcamTransform(source: Pick<WebcamSource, 'flipH' | 'flipV' | 'rotate90'>): string {
  const parts: string[] = [];
  if (source.rotate90) parts.push('rotate(-90deg)');
  if (source.flipH) parts.push('scaleX(-1)');
  if (source.flipV) parts.push('scaleY(-1)');
  return parts.join(' ') || 'none';
}

/** Longest wait for the first frame before the stream counts as failed. */
export const STREAM_START_TIMEOUT_MS = 15_000;

export type StreamHealth = 'ok' | 'lost' | 'stuck';

/**
 * Health of an MJPEG stream shown in an `<img>`. Chromium fires `load` at the first frame and then
 * nothing at all, whether the stream ends, breaks or stalls: only a broken connection shows, as
 * `naturalWidth` back to 0. The agent cuts ended and stalled streams (webcam proxy) so they show too.
 * `lost` = it was playing and broke; `stuck` = no first frame in time.
 */
export function streamHealth(input: { loaded: boolean; naturalWidth: number; sinceMs: number }): StreamHealth {
  if (input.loaded) return input.naturalWidth === 0 ? 'lost' : 'ok';
  return input.sinceMs > STREAM_START_TIMEOUT_MS ? 'stuck' : 'ok';
}
