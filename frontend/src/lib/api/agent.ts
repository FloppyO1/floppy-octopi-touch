/** Endpoints served by the FloppyOctoTouch agent itself (`/local/*`). */
import { getJson, putJson } from './http';
import type { AgentHealth, UsbListing } from './types';

export const getAgentHealth = () => getJson<AgentHealth>('/local/health');
export const getAgentSettings = () => getJson<unknown>('/local/settings');
export const putAgentSettings = <T>(settings: T) => putJson<T>('/local/settings', settings);
/** Implemented by the agent in session 5; a 404 means "USB not available yet". */
export const getUsbFiles = () => getJson<UsbListing>('/local/usb');
/** Switches the HDMI output (screen off when idle); a no-op that only logs in development. */
export const setDisplayPower = (on: boolean) => putJson<{ on: boolean }>('/local/display', { on });
export const getDisplayState = () => getJson<{ on: boolean }>('/local/display');
