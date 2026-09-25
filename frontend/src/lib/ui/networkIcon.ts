/** Icon of a network link: Wi-Fi with 0-4 bars from the signal, Ethernet, or no network. */
import EthernetPort from '@lucide/svelte/icons/ethernet-port';
import Wifi from '@lucide/svelte/icons/wifi';
import WifiHigh from '@lucide/svelte/icons/wifi-high';
import WifiLow from '@lucide/svelte/icons/wifi-low';
import WifiOff from '@lucide/svelte/icons/wifi-off';
import WifiZero from '@lucide/svelte/icons/wifi-zero';
import { signalBars, type LinkKind } from '../core/system';
import type { IconComponent, Tone } from './types';

export function networkIcon(kind: LinkKind, signal: number | null | undefined): IconComponent {
  if (kind === 'ethernet') return EthernetPort;
  if (kind === 'none') return WifiOff;
  const bars = signalBars(signal);
  if (bars === null || bars >= 4) return Wifi;
  return bars === 3 ? WifiHigh : bars === 2 ? WifiLow : WifiZero;
}

/** Red without a network, yellow with a weak Wi-Fi signal. */
export function networkTone(kind: LinkKind, signal: number | null | undefined): Tone {
  if (kind === 'none') return 'error';
  const bars = signalBars(signal);
  return bars !== null && bars <= 1 ? 'paused' : 'accent';
}
