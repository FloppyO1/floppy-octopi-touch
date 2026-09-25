/** Minimal JSON helpers. Every request goes to the agent (same origin), which adds the API key. */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: string,
  ) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new HttpError(response.status, `${method} ${path}: HTTP ${response.status}`, text);
  }
  // Many OctoPrint commands answer 204 (or 200 with an empty body).
  const text = await response.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const getJson = <T>(path: string) => request<T>('GET', path);
export const postJson = <T = void>(path: string, body: unknown) => request<T>('POST', path, body);
export const putJson = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
export const deleteJson = <T = void>(path: string) => request<T>('DELETE', path);

/** Encodes a storage path segment by segment, keeping the slashes (`a b/c.gcode` → `a%20b/c.gcode`). */
export function encodePath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

/** Builds a query string, skipping `undefined` values. */
export function query(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][];
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
}
