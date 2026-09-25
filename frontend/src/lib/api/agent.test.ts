import { afterEach, describe, expect, it, vi } from 'vitest';
import { importUsbFile } from './agent';
import { HttpError } from './http';

/** A streamed response whose body arrives in the given chunks (split mid-line on purpose). */
function streamed(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status, headers: { 'Content-Type': 'application/x-ndjson' } });
}

const request = { mount: 'usb0', path: 'a.gcode', folder: 'from usb' };

describe('importUsbFile', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports progress and resolves with the imported file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        streamed(['{"sent": 0, "total": 10}\n{"sent": 5,', ' "total": 10}\n', '{"done": true, "name": "a.gcode", "path": "from usb/a.gcode"}\n']),
      ),
    );
    const progress: number[] = [];
    const result = await importUsbFile(request, { onProgress: (sent) => progress.push(sent) });
    expect(result).toEqual({ name: 'a.gcode', path: 'from usb/a.gcode' });
    expect(progress).toEqual([0, 5]);
  });

  it('rejects with the upload error from the stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamed(['{"sent": 0, "total": 10}\n{"error": "upload_failed", "status": 409}\n'])),
    );
    await expect(importUsbFile(request)).rejects.toMatchObject({ status: 409, message: 'upload_failed' });
  });

  it('rejects on HTTP errors and truncated streams', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error": "too_large"}', { status: 413 })));
    await expect(importUsbFile(request)).rejects.toBeInstanceOf(HttpError);
    vi.stubGlobal('fetch', vi.fn(async () => streamed(['{"sent": 0, "total": 10}\n'])));
    await expect(importUsbFile(request)).rejects.toThrow(/without a result/);
  });
});
