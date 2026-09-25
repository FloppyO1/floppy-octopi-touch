import { getJson, postJson } from './http';
import type { AgentHealth, ConnectionInfo, LoginResponse, VersionInfo } from './types';

export const getVersion = () => getJson<VersionInfo>('/api/version');
export const getConnection = () => getJson<ConnectionInfo>('/api/connection');
export const getAgentHealth = () => getJson<AgentHealth>('/local/health');

/** Passive login: authenticates with the API key (added by the agent) and returns a socket session. */
export const passiveLogin = () => postJson<LoginResponse>('/api/login', { passive: true });
