/** Minimal JSON helpers. Every request goes to the agent (same origin), which adds the API key. */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
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
    throw new HttpError(response.status, `${method} ${path}: HTTP ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const getJson = <T>(path: string) => request<T>('GET', path);
export const postJson = <T>(path: string, body: unknown) => request<T>('POST', path, body);
export const putJson = <T>(path: string, body: unknown) => request<T>('PUT', path, body);
