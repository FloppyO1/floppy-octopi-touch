import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { LoginResponse } from './types';
import { backoffDelay, OctoPrintSocket, type SocketStatus, type WebSocketLike } from './socket';

class FakeSocket implements WebSocketLike {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  sent: unknown[] = [];
  closed = false;
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.closed = true;
    this.onclose?.();
  }
  receive(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

describe('backoffDelay', () => {
  it('grows exponentially and is capped', () => {
    expect([0, 1, 2, 3].map((n) => backoffDelay(n))).toEqual([1000, 2000, 4000, 8000]);
    expect(backoffDelay(10)).toBe(15000);
  });
});

describe('OctoPrintSocket', () => {
  let sockets: FakeSocket[];
  let statuses: SocketStatus[];
  let messages: [string, unknown][];
  let login: Mock<() => Promise<LoginResponse>>;

  const create = (throttle?: number) =>
    new OctoPrintSocket({
      throttle,
      createSocket: () => {
        const ws = new FakeSocket();
        sockets.push(ws);
        return ws;
      },
      login,
      onStatus: (s) => statuses.push(s),
      onMessage: (type, payload) => messages.push([type, payload]),
    });

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    statuses = [];
    messages = [];
    login = vi.fn<() => Promise<LoginResponse>>().mockResolvedValue({ name: 'admin', session: 's1' });
  });
  afterEach(() => vi.useRealTimers());

  it('authenticates after `connected` and applies the throttle', async () => {
    const socket = create(2);
    socket.connect('ws://test');
    sockets[0].receive({ connected: { version: '1.11.8' } });
    await vi.runAllTicks();
    await Promise.resolve();

    expect(sockets[0].sent).toEqual([{ auth: 'admin:s1' }, { throttle: 2 }]);
    expect(statuses).toEqual(['connecting', 'authenticating', 'open']);
    expect(messages[0]).toEqual(['connected', { version: '1.11.8' }]);
  });

  it('dispatches every key of a message', () => {
    const socket = create();
    socket.connect('ws://test');
    sockets[0].receive({ current: { a: 1 }, event: { type: 'X' } });
    expect(messages.map(([type]) => type)).toEqual(['current', 'event']);
  });

  it('logs in again on reauthRequired', async () => {
    const socket = create();
    socket.connect('ws://test');
    sockets[0].receive({ connected: {} });
    await Promise.resolve();
    login.mockResolvedValueOnce({ name: 'admin', session: 's2' });
    sockets[0].receive({ reauthRequired: { reason: 'stale' } });
    await Promise.resolve();
    await Promise.resolve();
    expect(sockets[0].sent).toEqual([{ auth: 'admin:s1' }, { auth: 'admin:s2' }]);
  });

  it('reconnects with backoff after a close, and stops for good on close()', () => {
    const socket = create();
    socket.connect('ws://test');
    sockets[0].close();
    expect(statuses.at(-1)).toBe('closed');
    vi.advanceTimersByTime(999);
    expect(sockets).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    socket.close();
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(2);
    expect(sockets[1].closed).toBe(true);
  });

  it('closes the socket when the login fails (then retries)', async () => {
    login.mockRejectedValueOnce(new Error('403'));
    const socket = create();
    socket.connect('ws://test');
    sockets[0].receive({ connected: {} });
    await Promise.resolve();
    await Promise.resolve();
    expect(sockets[0].closed).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(sockets).toHaveLength(2);
    socket.close();
  });
});
