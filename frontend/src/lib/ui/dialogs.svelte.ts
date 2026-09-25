/**
 * Promise-based dialogs rendered by <DialogHost> (mounted once in App.svelte):
 *
 *   if (await dialogs.confirm({ title, message, tone: 'danger' })) …
 *   const target = await dialogs.number({ title, value, min, max, unit: '°C' });   // null = cancelled
 *   const name = await dialogs.text({ title, value });                            // null = cancelled
 *
 * Requests stack: a dialog opened from another one is shown on top of it.
 */
import type { KeyboardLayer } from '../core/keyboard';
import type { Option } from './types';

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger' | 'warning';
}

export interface NumberRequest {
  title: string;
  value?: number | null;
  unit?: string;
  min?: number;
  max?: number;
  decimals?: number;
  presets?: Option<number>[];
}

export interface TextRequest {
  title: string;
  value?: string;
  layer?: KeyboardLayer;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
}

export type ActiveDialog =
  | { id: number; kind: 'confirm'; request: ConfirmRequest; resolve: (ok: boolean) => void }
  | { id: number; kind: 'number'; request: NumberRequest; resolve: (value: number | null) => void }
  | { id: number; kind: 'text'; request: TextRequest; resolve: (value: string | null) => void };

type Kind = ActiveDialog['kind'];
type RequestOf<K extends Kind> = Extract<ActiveDialog, { kind: K }>['request'];
type ResultOf<K extends Kind> = Parameters<Extract<ActiveDialog, { kind: K }>['resolve']>[0];

class DialogService {
  stack = $state.raw<ActiveDialog[]>([]);
  private nextId = 1;

  confirm = (request: ConfirmRequest) => this.open('confirm', request);
  number = (request: NumberRequest) => this.open('number', request);
  text = (request: TextRequest) => this.open('text', request);

  /** Closes the dialog `id` with `result` (called by DialogHost). */
  close(id: number, result: unknown): void {
    const dialog = this.stack.find((d) => d.id === id);
    if (!dialog) return;
    this.stack = this.stack.filter((d) => d.id !== id);
    (dialog.resolve as (value: unknown) => void)(result);
  }

  /** Cancels every open dialog (e.g. screensaver, disconnection). */
  closeAll(): void {
    for (const dialog of [...this.stack].reverse()) {
      this.close(dialog.id, dialog.kind === 'confirm' ? false : null);
    }
  }

  private open<K extends Kind>(kind: K, request: RequestOf<K>): Promise<ResultOf<K>> {
    return new Promise((resolve) => {
      const dialog = { id: this.nextId++, kind, request, resolve } as unknown as ActiveDialog;
      this.stack = [...this.stack, dialog];
    });
  }
}

export const dialogs = new DialogService();
