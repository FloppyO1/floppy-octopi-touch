import { passiveLogin } from './octoprint';
import type { LoginResponse } from './types';

export type SocketStatus = 'connecting' | 'authenticating' | 'open' | 'closed';

/** Minimal WebSocket surface used by the client (lets tests inject a fake). */
export interface WebSocketLike {
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  send(data: string): void;
  close(): void;
}

export interface SocketOptions {
  onStatus?: (status: SocketStatus) => void;
  onMessage?: (type: string, payload: unknown) => void;
  /**
   * OctoPrint throttle factor: `current` messages every 500 ms × factor. 2 (1 Hz) is plenty for the
   * dashboard and halves the work on the Pi; logs and temperatures are batched, nothing is lost.
   */
  throttle?: number;
  createSocket?: (url: string) => WebSocketLike;
  login?: () => Promise<LoginResponse>;
}

/** Exponential backoff with an upper bound: 1 s, 2 s, 4 s … capped at `max`. */
export function backoffDelay(attempt: number, base = 1000, max = 15000): number {
  return Math.min(max, base * 2 ** Math.max(0, attempt));
}

function defaultUrl(): string {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/sockjs/websocket`;
}

/**
 * Raw WebSocket client for OctoPrint's push API (`/sockjs/websocket`).
 * Flow: open → server sends `connected` → passive login → `{"auth": "name:session"}` → throttle.
 * `reauthRequired` (session expired, user modified…) repeats the login on the same socket.
 */
export class OctoPrintSocket {
  private ws: WebSocketLike | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private readonly createSocket: (url: string) => WebSocketLike;
  private readonly login: () => Promise<LoginResponse>;

  constructor(private readonly options: SocketOptions = {}) {
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url) as WebSocketLike);
    this.login = options.login ?? passiveLogin;
  }

  get connected(): boolean {
    return this.ws !== null;
  }

  connect(url = defaultUrl()): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.open(url);
  }

  close(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  private open(url: string): void {
    const ws = this.createSocket(url);
    this.ws = ws;
    this.options.onStatus?.('connecting');

    ws.onmessage = (event) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(event.data as string);
      } catch {
        return;
      }
      for (const [type, payload] of Object.entries(message)) {
        if (type === 'connected' || type === 'reauthRequired') void this.authenticate(ws);
        this.options.onMessage?.(type, payload);
      }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.options.onStatus?.('closed');
      this.scheduleReconnect(url);
    };
  }

  private async authenticate(ws: WebSocketLike): Promise<void> {
    this.options.onStatus?.('authenticating');
    try {
      const { name, session } = await this.login();
      if (this.ws !== ws) return;
      ws.send(JSON.stringify({ auth: `${name}:${session}` }));
      if (this.options.throttle && this.options.throttle > 1) {
        ws.send(JSON.stringify({ throttle: this.options.throttle }));
      }
      this.attempt = 0;
      this.options.onStatus?.('open');
    } catch {
      ws.close();
    }
  }

  private scheduleReconnect(url: string): void {
    if (this.stopped) return;
    const delay = backoffDelay(this.attempt++);
    this.timer = setTimeout(() => this.open(url), delay);
  }
}
