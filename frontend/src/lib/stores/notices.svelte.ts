/** Big print notices (done / failed / cancelled elsewhere / paused elsewhere) and the print-done beep. */
import { printer as printerApi } from '../api/octoprint';
import { clearsNotice, noticeForEvent, type Notice } from '../core/notices';
import { job } from './printer.svelte';
import { settings } from './settings.svelte';

class NoticeStore {
  /** Only the latest notice is kept: a new print event replaces the previous one. */
  current = $state.raw<Notice | null>(null);

  handleEvent(type: string, payload: Record<string, unknown> | null): void {
    if (this.current && clearsNotice(type, this.current)) this.current = null;
    const { notice, beep } = noticeForEvent(type, payload, job.local);
    if (notice) this.current = notice;
    if (beep) void this.beep();
  }

  dismiss(): void {
    this.current = null;
  }

  /** M300 through the printer's own buzzer (the LCD stays connected on the Tatara A8). */
  private async beep(): Promise<void> {
    const { beep, beepGcode } = settings.value.printDone;
    if (!beep || !beepGcode.trim()) return;
    try {
      await printerApi.command(beepGcode);
    } catch {
      /* printer gone (failed print): nothing to beep with */
    }
  }
}

export const notices = new NoticeStore();
