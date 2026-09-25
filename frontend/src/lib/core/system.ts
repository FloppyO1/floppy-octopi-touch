/** System screen logic (pure): gauge tones of the host metrics, network summary, system commands. */
import type { NetworkInfo, SystemCommand, SystemCommands } from '../api/types';
import type { GaugeTone } from './gauge';

/** CPU, RAM and disk usage: accent while fine, yellow when high, red when almost full. */
export function usageTone(percent: number | null | undefined): GaugeTone {
  if (percent == null) return 'neutral';
  if (percent >= 90) return 'error';
  if (percent >= 75) return 'paused';
  return 'accent';
}

/** The Pi 4 starts throttling at 80 °C (soft limit from 60 °C on some firmware). */
export function cpuTempTone(celsius: number | null | undefined): GaugeTone {
  if (celsius == null) return 'neutral';
  if (celsius >= 80) return 'error';
  if (celsius >= 70) return 'paused';
  return 'ok';
}

export interface UptimeParts {
  days: number;
  hours: number;
  minutes: number;
}

export function uptimeParts(seconds: number | null | undefined): UptimeParts | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const total = Math.floor(seconds / 60);
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}

/** Signal strength (0-100 %) as 0-4 bars, `null` when unknown. */
export function signalBars(signal: number | null | undefined): number | null {
  if (signal == null || !Number.isFinite(signal)) return null;
  if (signal >= 75) return 4;
  if (signal >= 50) return 3;
  if (signal >= 25) return 2;
  return signal > 0 ? 1 : 0;
}

export type LinkKind = 'wifi' | 'ethernet' | 'none';

export interface NetworkSummary {
  kind: LinkKind;
  /** Interface carrying the default route (or the first with an address). */
  interface: string | null;
  ip: string | null;
  ssid: string | null;
  signal: number | null;
}

/** What the status bar and the System screen show about the network. */
export function networkSummary(network: NetworkInfo | null | undefined): NetworkSummary {
  const none: NetworkSummary = { kind: 'none', interface: null, ip: null, ssid: null, signal: null };
  if (!network) return none;
  const primary = network.interfaces.find((i) => i.name === network.primary && i.ipv4);
  if (!primary) {
    // Wi-Fi associated but no address yet still counts as "no network".
    return none;
  }
  const wifi = network.wifi?.interface === primary.name ? network.wifi : null;
  return {
    kind: primary.wireless ? 'wifi' : 'ethernet',
    interface: primary.name,
    ip: primary.ipv4,
    ssid: wifi?.ssid ?? null,
    signal: wifi?.signal ?? null,
  };
}

/** Kind of an OctoPrint system command, for its icon, colour and confirmation text. */
export type SystemCommandKind = 'restart' | 'restartSafe' | 'reboot' | 'shutdown' | 'other';

export interface SystemAction extends SystemCommand {
  kind: SystemCommandKind;
}

const CORE_KINDS: Record<string, SystemCommandKind> = {
  restart: 'restart',
  restart_safe: 'restartSafe',
  reboot: 'reboot',
  shutdown: 'shutdown',
};
const ORDER: SystemCommandKind[] = ['restart', 'restartSafe', 'reboot', 'shutdown', 'other'];

/**
 * OctoPrint's system commands in a stable order: OctoPrint restart first, then reboot and shutdown
 * (only listed when configured in OctoPrint, as OctoPi does), then custom and plugin commands.
 */
export function systemActions(commands: SystemCommands | null | undefined): SystemAction[] {
  if (!commands) return [];
  const all = [...(commands.core ?? []), ...(commands.custom ?? []), ...(commands.plugin ?? [])];
  return all
    .filter((c) => c.action && c.action !== 'divider')
    .map((c) => ({ ...c, kind: (c.source === 'core' && CORE_KINDS[c.action]) || 'other' }))
    .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

/** OctoPrint's confirmation texts are HTML (`<strong>…</strong></p><p>…`): plain text for our dialog. */
export function plainText(html: string): string {
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
  return html
    .replace(/<\/p>\s*<p>|<br\s*\/?>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name: string) => entities[name])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
