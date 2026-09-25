/**
 * Big print notices (end of print, failure, pause) from OctoPrint events.
 *
 * Payloads (OctoPrint 1.11, printer/standard.py): `{ name, path, origin, size, owner?, user? }`
 * plus `time` (s) for PrintDone/PrintFailed and `reason` ("error" | "cancelled") for PrintFailed.
 * Pauses and cancels the user just did on this screen are not announced again.
 */

export type NoticeKind = 'done' | 'failed' | 'cancelled' | 'paused';

export interface Notice {
  kind: NoticeKind;
  /** File name (display), `null` if the payload had none. */
  file: string | null;
  origin: string | null;
  path: string | null;
  /** Print duration in seconds (done/failed/cancelled). */
  time: number | null;
}

export interface LocalActions {
  /** `Date.now()` of the last pause/cancel requested from this dashboard. */
  pauseAt?: number;
  cancelAt?: number;
}

/** A pause/cancel event arriving this long after a local request is considered ours. */
export const LOCAL_ACTION_WINDOW_MS = 60_000;

export interface NoticeDecision {
  notice: Notice | null;
  /** Play the print-done beep (M300) if enabled in the settings. */
  beep: boolean;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const recent = (at: number | undefined, now: number) =>
  at !== undefined && now - at >= 0 && now - at < LOCAL_ACTION_WINDOW_MS;

export function noticeForEvent(
  type: string,
  payload: Record<string, unknown> | null,
  local: LocalActions,
  now = Date.now(),
): NoticeDecision {
  const make = (kind: NoticeKind): Notice => ({
    kind,
    file: str(payload?.name) ?? str(payload?.path),
    origin: str(payload?.origin),
    path: str(payload?.path),
    time: num(payload?.time),
  });
  switch (type) {
    case 'PrintDone':
      return { notice: make('done'), beep: true };
    case 'PrintFailed':
      if (payload?.reason === 'cancelled') {
        return { notice: recent(local.cancelAt, now) ? null : make('cancelled'), beep: false };
      }
      return { notice: make('failed'), beep: true };
    case 'PrintPaused':
      // Filament change (M600), runout or a pause from another client: tell the user.
      return { notice: recent(local.pauseAt, now) ? null : make('paused'), beep: false };
    default:
      return { notice: null, beep: false };
  }
}

/** Events that make the current notice obsolete. */
export function clearsNotice(type: string, current: Notice): boolean {
  if (type === 'PrintResumed' || type === 'PrintCancelled') return current.kind === 'paused';
  if (type === 'PrintStarted') return true;
  return false;
}
