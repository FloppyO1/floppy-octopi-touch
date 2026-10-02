/**
 * System screen actions: OctoPrint system commands, kiosk restart, API key, PSU and custom actions.
 * Also used by the status bar (quick actions) and the connection overlay (API key).
 */
import { putApiKey, restartKiosk } from '../../lib/api/agent';
import { HttpError } from '../../lib/api/http';
import { plugin, system as systemApi } from '../../lib/api/octoprint';
import { macroCommands } from '../../lib/core/macros';
import { parsePluginData, type CustomAction } from '../../lib/core/power';
import { FIX_COMMENT } from '../../lib/core/stopScript';
import { plainText, type SystemAction } from '../../lib/core/system';
import { t } from '../../lib/i18n/index.svelte';
import { connection, power, printer, settings, stopScript, system, terminal } from '../../lib/stores';
import { dialogs } from '../../lib/ui/dialogs.svelte';
import { toast } from '../../lib/ui/toast.svelte';

const RELOAD_DELAY_MS = 1500;

/** Title and message of our confirmation for an OctoPrint system command. */
function commandConfirmation(command: SystemAction): { title: string; message: string } {
  const job = printer.busy ? `\n\n${t('system.duringJob')}` : '';
  if (command.kind === 'other') {
    const theirs = command.confirm ? plainText(command.confirm) : t('system.runMessage');
    return { title: t('system.runTitle', { name: command.name }), message: theirs + job };
  }
  return { title: t(`system.cmd.${command.kind}Title`), message: t(`system.cmd.${command.kind}Message`) + job };
}

/**
 * Runs an OctoPrint system command after a confirmation. OctoPrint restarts/reboots/shutdowns drop
 * the connection: the connection overlay takes over until everything is back.
 */
export async function runSystemCommand(command: SystemAction): Promise<void> {
  const hard = command.kind === 'shutdown' || command.kind === 'reboot';
  const ok = await dialogs.confirm({
    ...commandConfirmation(command),
    confirmLabel: command.kind === 'other' ? t('system.run') : t(`system.cmd.${command.kind}`),
    tone: hard || printer.busy ? 'danger' : command.kind === 'other' ? 'primary' : 'warning',
  });
  if (!ok) return;
  try {
    await systemApi.run(command.source, command.action);
  } catch {
    toast.show(t('system.commandFailed'), { tone: 'error' });
    return;
  }
  if (command.kind === 'shutdown') toast.show(t('system.shuttingDown'), { tone: 'warning', durationMs: 20_000 });
  else if (command.kind === 'reboot') toast.show(t('system.rebooting'), { tone: 'warning', durationMs: 20_000 });
  else if (command.kind === 'other') toast.show(t('system.commandSent', { name: command.name }), { tone: 'ok' });
  else toast.show(t('system.restarting'), { tone: 'warning', durationMs: 10_000 });
}

/**
 * Restarts the kiosk (cage + Chromium) through the agent. Without a restart command (development)
 * or when it fails, reloading the page is the next best thing.
 */
export async function restartInterface(): Promise<void> {
  const ok = await dialogs.confirm({
    title: t('system.kioskTitle'),
    message: t('system.kioskMessage'),
    confirmLabel: t('system.kioskRestart'),
    tone: 'primary',
  });
  if (!ok) return;
  try {
    const { restarted } = await restartKiosk();
    if (restarted) return; // Chromium goes away with this page
  } catch {
    toast.show(t('system.kioskFailed'), { tone: 'warning' });
  }
  await settings.flush();
  setTimeout(() => location.reload(), RELOAD_DELAY_MS);
}

function apiKeyError(error: unknown): string {
  if (error instanceof HttpError) {
    if (error.status === 400) return t('apikey.error.format');
    if (error.status === 422) return t('apikey.error.rejected');
    if (error.status === 502) return t('apikey.error.unreachable');
  }
  return t('apikey.error.save');
}

/**
 * Asks for a new OctoPrint API key on the in-app keyboard, has the agent check and save it, then
 * reloads the page so that the socket logs in with it. Returns true when the key was replaced.
 */
export async function changeApiKey(): Promise<boolean> {
  const key = await dialogs.text({
    title: t('apikey.enterTitle'),
    placeholder: t('apikey.placeholder'),
    maxLength: 128,
  });
  if (!key?.trim()) return false;
  try {
    const state = await putApiKey(key.trim());
    toast.show(t(state.persistent ? 'apikey.saved' : 'apikey.savedNotPersistent'), {
      tone: state.persistent ? 'ok' : 'warning',
    });
  } catch (error) {
    toast.show(apiKeyError(error), { tone: 'error', durationMs: 6000 });
    return false;
  }
  await connection.refreshHealth();
  await settings.flush();
  setTimeout(() => location.reload(), RELOAD_DELAY_MS);
  return true;
}

/** Switches the PSU; turning it off always asks (and warns loudly during a job). */
export async function setPsu(on: boolean): Promise<void> {
  if (!on) {
    const ok = await dialogs.confirm({
      title: t('power.offTitle'),
      message: printer.busy ? t('power.offDuringJob') : t('power.offMessage'),
      confirmLabel: t('power.turnOff'),
      tone: printer.busy ? 'danger' : 'warning',
    });
    if (!ok) return;
  }
  try {
    await power.set(on);
  } catch {
    toast.show(t('power.failed'), { tone: 'error' });
  }
}

/** What a custom action does, in one line (list rows and the confirmation). */
export function actionSummary(action: CustomAction): string {
  switch (action.kind) {
    case 'gcode':
      return macroCommands(action.gcode).join(' · ');
    case 'system': {
      const command = system.commands?.find(
        (c) => c.source === action.system.source && c.action === action.system.action,
      );
      return command?.name ?? `${action.system.source}/${action.system.action}`;
    }
    case 'plugin':
      return `${action.plugin.id} → ${action.plugin.command}`;
  }
}

/** Runs a custom action: confirmation when asked for, and for G-code always during a job. */
export async function runCustomAction(action: CustomAction): Promise<void> {
  const commands = macroCommands(action.gcode);
  if (action.kind === 'gcode' && !printer.operational) {
    toast.show(t('terminal.notConnected'), { tone: 'warning' });
    return;
  }
  const duringJob = action.kind === 'gcode' && printer.busy;
  if (action.confirm || duringJob) {
    const ok = await dialogs.confirm({
      title: t('macros.runTitle', { name: action.name }),
      message: `${duringJob ? `${t('macros.runDuringJob')}\n\n` : ''}${actionSummary(action)}`,
      confirmLabel: t('macros.run'),
      tone: duringJob || action.color === 'danger' || action.color === 'warn' ? 'warning' : 'primary',
    });
    if (!ok) return;
  }
  try {
    if (action.kind === 'gcode') await terminal.send(commands);
    else if (action.kind === 'system') await systemApi.run(action.system.source, action.system.action);
    else await plugin.command(action.plugin.id.trim(), action.plugin.command.trim(), parsePluginData(action.plugin.data) ?? {});
    toast.show(t('macros.sent', { name: action.name }), { tone: 'ok' });
  } catch {
    toast.show(t('actions.failed', { name: action.name }), { tone: 'error' });
  }
}

/** Every setting back to a fresh install, after a confirmation. */
export async function resetSettings(): Promise<void> {
  const ok = await dialogs.confirm({
    title: t('settings.resetTitle'),
    message: t('settings.resetMessage'),
    confirmLabel: t('settings.reset'),
    tone: 'danger',
  });
  if (!ok) return;
  await settings.reset();
  toast.show(t('settings.resetDone'), { tone: 'ok' });
}

/** Lines shown in the fix preview and in the manual steps, one per row. */
const scriptLines = (lines: readonly string[]) => lines.map((line) => `    ${line}`).join('\n');

/**
 * "Fix" for OctoPrint's script after Stop: preview of the lines appended, then saved through
 * `/api/settings`. Without the SETTINGS permission (403) or on any failure: the manual steps.
 * Returns true when the script was saved.
 */
export async function fixStopScript(): Promise<boolean> {
  const missing = stopScript.status?.missing ?? [];
  if (!missing.length) return false;
  const lines = scriptLines([FIX_COMMENT, ...missing]);
  const ok = await dialogs.confirm({
    title: t('stopScript.fixTitle'),
    message: t('stopScript.fixMessage', { lines }),
    confirmLabel: t('stopScript.fix'),
  });
  if (!ok) return false;
  try {
    await stopScript.fix();
    toast.show(t('stopScript.fixed'), { tone: 'ok' });
    return true;
  } catch (error) {
    const reason =
      error instanceof HttpError && error.status === 403
        ? t('stopScript.forbidden')
        : t('stopScript.failed', { detail: error instanceof HttpError ? `HTTP ${error.status}` : String(error) });
    await dialogs.confirm({
      title: t('stopScript.manualTitle'),
      message: t('stopScript.manualSteps', { reason, lines: scriptLines(missing) }),
      confirmLabel: t('common.ok'),
      cancelLabel: null,
      tone: 'warning',
    });
    return false;
  }
}
