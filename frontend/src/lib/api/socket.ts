import { passiveLogin } from './octoprint';

export type SocketStatus = 'connecting' | 'authenticating' | 'open' | 'closed';

export interface SocketHandlers {
  onStatus?: (status: SocketStatus) => void;
  onMessage?: (type: string, payload: unknown) => void;
}

/** Exponential backoff with an upper bound: 1 s, 2 s, 4 s … capped at `max`. */
export function backoffDelay(attempt: number, base = 1000, max = 15000): number {
  return Math.min(max, base * 2 ** Math.max(0, attempt));
}

/**
 * Raw WebSocket client for OctoPrint's push API (`/sockjs/websocket`).
 * Flow: open → server sends `connected` → passive login → `{"auth": "name:session"}`.
 */
export class OctoPrintSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;

  constructor(private readonly handlers: SocketHandlers) {}

  connect(): void {
    this.stopped = false;
    this.open();
  }

  close(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }

  private open(): void {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/sockjs/websocket`);
    this.ws = ws;
    this.handlers.onStatus?.('connecting');

    ws.onmessage = (event) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(event.data as string);
      } catch {
        return;
      }
      for (const [type, payload] of Object.entries(message)) {
        if (type === 'connected') void this.authenticate(ws);
        this.handlers.onMessage?.(type, payload);
      }
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.handlers.onStatus?.('closed');
      this.scheduleReconnect();
    };
  }

  private async authenticate(ws: WebSocket): Promise<void> {
    this.handlers.onStatus?.('authenticating');
    try {
      const { name, session } = await passiveLogin();
      ws.send(JSON.stringify({ auth: `${name}:${session}` }));
      this.attempt = 0;
      this.handlers.onStatus?.('open');
    } catch {
      ws.close();
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    const delay = backoffDelay(this.attempt++);
    this.timer = setTimeout(() => this.open(), delay);
  }
}
