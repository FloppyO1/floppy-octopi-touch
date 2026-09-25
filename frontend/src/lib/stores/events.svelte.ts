/**
 * OctoPrint events (PrintDone, PrintFailed, FileAdded…) plus the dashboard's own `host:*` events
 * (host prompts, notifications, actions). Components subscribe with `events.on()`.
 */

export interface AppEvent {
  id: number;
  type: string;
  payload: Record<string, unknown> | null;
  time: number;
}

export type EventHandler = (event: AppEvent) => void;

const MAX_RECENT = 50;

class EventStore {
  recent = $state.raw<AppEvent[]>([]);
  private nextId = 1;
  private handlers = new Map<string, Set<EventHandler>>();

  emit(type: string, payload: Record<string, unknown> | null = null): void {
    const event: AppEvent = { id: this.nextId++, type, payload, time: Date.now() };
    const recent = [event, ...this.recent];
    this.recent = recent.length > MAX_RECENT ? recent.slice(0, MAX_RECENT) : recent;
    for (const key of [type, '*']) {
      for (const handler of this.handlers.get(key) ?? []) {
        try {
          handler(event);
        } catch (error) {
          console.error(`event handler for ${type} failed`, error);
        }
      }
    }
  }

  /** Subscribes to one event type (`'*'` = all); returns the unsubscribe function. */
  on(type: string, handler: EventHandler): () => void {
    let set = this.handlers.get(type);
    if (!set) this.handlers.set(type, (set = new Set()));
    set.add(handler);
    return () => set.delete(handler);
  }
}

export const events = new EventStore();
