/** Short non-blocking messages rendered by <ToastHost>: `toast.show(t('…'), { tone: 'ok' })`. */

export type ToastTone = 'info' | 'ok' | 'warning' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const MAX_VISIBLE = 3;
const DEFAULT_DURATION_MS = 3500;

class ToastService {
  items = $state.raw<Toast[]>([]);
  private nextId = 1;
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  show(message: string, options: { tone?: ToastTone; durationMs?: number } = {}): number {
    const toast: Toast = { id: this.nextId++, message, tone: options.tone ?? 'info' };
    const items = [...this.items, toast];
    for (const old of items.slice(0, Math.max(0, items.length - MAX_VISIBLE))) this.clearTimer(old.id);
    this.items = items.slice(-MAX_VISIBLE);
    const duration = options.durationMs ?? DEFAULT_DURATION_MS;
    if (duration > 0) this.timers.set(toast.id, setTimeout(() => this.dismiss(toast.id), duration));
    return toast.id;
  }

  dismiss(id: number): void {
    this.clearTimer(id);
    this.items = this.items.filter((toast) => toast.id !== id);
  }

  private clearTimer(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
  }
}

export const toast = new ToastService();
