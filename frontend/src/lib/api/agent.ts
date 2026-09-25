/** Endpoints served by the FloppyOctoTouch agent itself (`/local/*`). */
import { getJson, putJson } from './http';
import type { AgentHealth, UsbListing } from './types';

export const getAgentHealth = () => getJson<AgentHealth>('/local/health');
export const getAgentSettings = () => getJson<unknown>('/local/settings');
export const putAgentSettings = <T>(settings: T) => putJson<T>('/local/settings', settings);
/** Implemented by the agent in session 5; a 404 means "USB not available yet". */
export const getUsbFiles = () => getJson<UsbListing>('/local/usb');
