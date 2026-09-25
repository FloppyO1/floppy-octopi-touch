/** Terminal screen actions: typed commands and macros. */
import { macroCommands } from '../../lib/core/macros';
import type { Macro } from '../../lib/core/settings';
import { t } from '../../lib/i18n/index.svelte';
import { printer, terminal } from '../../lib/stores';
import { dialogs } from '../../lib/ui/dialogs.svelte';
import { toast } from '../../lib/ui/toast.svelte';

/** Sends the typed command; returns true when it was accepted (the input is cleared then). */
export async function sendCommand(text: string): Promise<boolean> {
  if (!text.trim()) return false;
  if (!printer.operational) {
    toast.show(t('terminal.notConnected'), { tone: 'warning' });
    return false;
  }
  try {
    await terminal.submit(text);
    return true;
  } catch {
    toast.show(t('terminal.failed'), { tone: 'error' });
    return false;
  }
}

/**
 * Runs a macro: confirmation when the macro asks for it, and always while a job is running (the
 * commands are sent between the lines of the file).
 */
export async function runMacro(macro: Macro): Promise<void> {
  const commands = macroCommands(macro.gcode);
  if (!commands.length || !printer.operational) return;
  if (printer.busy || macro.confirm) {
    const ok = await dialogs.confirm({
      title: t('macros.runTitle', { name: macro.name }),
      message: `${printer.busy ? `${t('macros.runDuringJob')}\n\n` : ''}${commands.join('\n')}`,
      confirmLabel: t('macros.run'),
      tone: printer.busy || macro.color === 'danger' || macro.color === 'warn' ? 'warning' : 'primary',
    });
    if (!ok) return;
  }
  try {
    await terminal.send(commands);
    toast.show(t('macros.sent', { name: macro.name }), { tone: 'ok' });
  } catch {
    toast.show(t('terminal.failed'), { tone: 'error' });
  }
}
