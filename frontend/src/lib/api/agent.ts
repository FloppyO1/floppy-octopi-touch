/** Endpoints served by the FloppyOctoTouch agent itself (`/local/*`). */
import { getJson, HttpError, postJson, putJson, query } from './http';
import type { AgentHealth, UsbImportResult, UsbListing, UsbMount } from './types';

export const getAgentHealth = () => getJson<AgentHealth>('/local/health');
export const getAgentSettings = () => getJson<unknown>('/local/settings');
export const putAgentSettings = <T>(settings: T) => putJson<T>('/local/settings', settings);
/** Switches the HDMI output (screen off when idle); a no-op that only logs in development. */
export const setDisplayPower = (on: boolean) => putJson<{ on: boolean }>('/local/display', { on });
export const getDisplayState = () => getJson<{ on: boolean }>('/local/display');

/** Thumbnail extracted by the agent from a file of OctoPrint's local storage (404 = none). */
export const localThumbnailUrl = (path: string, version?: number | null) =>
  `/local/thumbnail${query({ path, v: version ?? undefined })}`;

// ------------------------------------------------------------------ USB sticks

export const getUsb = () => getJson<UsbListing>('/local/usb');
export const ejectUsb = (mount: string) => postJson<{ ok: boolean }>('/local/usb/eject', { mount });
export const usbThumbnailUrl = (mount: string, path: string) =>
  `/local/usb/thumbnail${query({ mount, path })}`;

export interface ImportRequest {
  mount: string;
  path: string;
  /** Destination folder in OctoPrint's local storage ('' = root). */
  folder: string;
}

/**
 * Copies a stick file into OctoPrint's local storage. The agent streams NDJSON lines
 * (`{sent, total}` … then the result); aborting the signal cancels the upload.
 */
export async function importUsbFile(
  request: ImportRequest,
  options: { signal?: AbortSignal; onProgress?: (sent: number, total: number) => void } = {},
): Promise<UsbImportResult> {
  const response = await fetch('/local/usb/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: options.signal,
  });
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new HttpError(response.status, `import: HTTP ${response.status}`, text);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += value;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines.filter(Boolean)) {
      const message = JSON.parse(line) as Record<string, unknown>;
      if (message.done) return { name: String(message.name), path: String(message.path) };
      if (message.error) {
        throw new HttpError(Number(message.status ?? 502), String(message.error), String(message.detail ?? ''));
      }
      options.onProgress?.(Number(message.sent), Number(message.total));
    }
    if (done) throw new HttpError(502, 'import: stream ended without a result');
  }
}

/** Agent push events (Server-Sent Events); the browser reconnects by itself. Returns `close`. */
export function subscribeAgentEvents(handlers: { usb?: (mounts: UsbMount[]) => void }): () => void {
  const source = new EventSource('/local/events');
  source.addEventListener('usb', (event) => {
    const data = JSON.parse((event as MessageEvent<string>).data) as { mounts: UsbMount[] };
    handlers.usb?.(data.mounts);
  });
  return () => source.close();
}
